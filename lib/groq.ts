import "server-only";

/**
 * Transaction understanding (server-side only).
 *
 * Text/vision extraction and field cleanup go through the internal Hermes
 * bridge (HERMES_BRIDGE_URL/KEY); voice transcription stays on Groq (uses
 * GROQ_KEY) since Hermes has no audio API.
 *
 * Every function returns null on ANY failure (missing key, network, refusal,
 * malformed JSON) so callers can fall back to the regex parser in
 * lib/sms-parser.ts. LLM output is advisory: it pre-fills a pending
 * transaction that the user always reviews before saving.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";

// All configured Groq keys: GROQ_KEYS (comma/space/newline separated) plus the
// legacy single GROQ_KEY. Free-tier limits are per key, so N keys multiply
// throughput ~N× and the pool rotates instantly when one is rate-limited.
const groqKeys = (): string[] => {
    const raw = `${process.env.GROQ_KEYS ?? ""},${process.env.GROQ_KEY ?? ""}`;
    const seen = new Set<string>();
    return raw
        .split(/[\s,]+/)
        .map((k) => k.trim())
        .filter((k) => k.startsWith("gsk_") && !seen.has(k) && (seen.add(k), true));
};

// Cooldown is per (scope, key) — the scope is the model/endpoint, so a key
// rate-limited on the vision model is still free for transcription and text.
// Each limit has its own window (Groq's own "try again in Xs" drives it, and
// vision naturally throttles ~1 image/key/minute; whisper and text differ).
// Module-level so it survives across warm serverless invocations.
const cooldownUntil = new Map<string, number>();
const cdKey = (scope: string, key: string) => `${scope}::${key}`;

// Round-robin cursor so CONCURRENT callers each claim a different key instead
// of all grabbing keys[0] and colliding. Selection is synchronous, so the
// cursor advance is atomic between the interleaving await points.
let groqCursor = 0;

/** Picks a key usable for `scope` now, or the one freeing up soonest. */
const pickGroqKey = (keys: string[], scope: string): { key: string; waitMs: number } | null => {
    const n = keys.length;
    if (n === 0) return null;
    const now = Date.now();
    let soonest: { key: string; waitMs: number } | null = null;
    for (let off = 0; off < n; off++) {
        const idx = (groqCursor + off) % n;
        const key = keys[idx];
        const waitMs = Math.max(0, (cooldownUntil.get(cdKey(scope, key)) ?? 0) - now);
        if (waitMs === 0) {
            groqCursor = (idx + 1) % n; // next caller starts past this key
            return { key, waitMs: 0 };
        }
        if (!soonest || waitMs < soonest.waitMs) soonest = { key, waitMs };
    }
    return soonest; // all cooling — the one freeing up soonest
};

const coolDownGroqKey = (key: string, seconds: number, scope: string) => {
    cooldownUntil.set(cdKey(scope, key), Date.now() + Math.max(1, seconds) * 1000);
};

// An account-level failure (e.g. "Organization has been restricted") is not
// a bad request — it's a dead key that will fail on every future call too.
// Must be treated like a revoked key (401/403): park it and rotate to the
// next one, never a flat give-up, or one broken key/org in the pool takes
// the whole feature down even when other keys are healthy.
const isDeadKeyError = (errorText: string): boolean =>
    /organization_restricted|organization has been restricted|account.*(restrict|suspend|disab)/i.test(errorText);

const parseRetrySeconds = (errorText: string): number => {
    // An explicit "try again in Xs" is a short per-minute rate limit — honor it
    // exactly. (Groq's TPM message also links to /settings/billing, so we must
    // NOT treat "billing" as a daily-quota signal or every 429 parks for an hour.)
    const m = errorText.match(/try again in ([\d.]+)s/i) ?? errorText.match(/retry.*?([\d.]+)\s*s/i);
    if (m) return parseFloat(m[1]);
    // No wait hint at all — a hard daily quota / exhaustion; park it a while
    if (/quota|per day|daily limit|resource_exhausted|exceeded your/i.test(errorText)) return 3600;
    return 5; // sane default
};

// Full large-v3 first (best on Indian names/accents and noise), turbo as the
// higher-quota fallback
const WHISPER_MODELS = ["whisper-large-v3", "whisper-large-v3-turbo"];

// Whisper hallucinates stock phrases from its training data on silent/near-
// silent audio (subtitle credits, YouTube outros). Treat these as "no speech".
// Matched as the WHOLE utterance (not substrings) so real speech like
// "amazon.com" is never dropped — except "amara.org", which never appears in
// genuine transaction speech.
const WHISPER_HALLUCINATIONS = new Set([
    "subtitles by the amara.org community",
    "thanks for watching",
    "thank you for watching",
    "thank you",
    "please subscribe",
    "like and subscribe",
    "you",
    "bye",
    "bye.",
]);

const isHallucinatedSilence = (text: string): boolean => {
    const t = text.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
    if (t.length <= 1) return true;               // "", "."
    if (t.includes("amara.org")) return true;     // never in real speech
    return WHISPER_HALLUCINATIONS.has(t);         // whole-utterance match only
};

export type LlmContext = {
    /** The user's Spendly account names, for matching */
    accounts: string[];
    /** The user's category names, for matching */
    categories: string[];
};

export type LlmTransaction = {
    isTransaction: boolean;
    /** Signed miliunits: negative = money out */
    amount: number | null;
    payee: string | null;
    date: Date | null;
    /** Exact account/category name from the user's lists, when confidently matched */
    accountName: string | null;
    categoryName: string | null;
    /** Short human note, e.g. "a/c ..0934" or "UPI ref 1234" */
    accountHint: string | null;
    /** A clean one-line note for the transaction, e.g. "NEFT from RBROTHERS, a/c ..0934" */
    note: string | null;
    /** True when the user moves money between their OWN accounts */
    isTransfer: boolean;
    /** For transfers: destination account name from the user's list */
    toAccountName: string | null;
    /** Explicit spoken command to switch forms ("switch to transfer form") */
    switchTo: "transfer" | "transaction" | null;
};

type RawExtraction = {
    is_transaction?: boolean;
    amount?: number | null;
    direction?: "in" | "out" | null;
    payee?: string | null;
    date?: string | null;
    account_name?: string | null;
    category_name?: string | null;
    account_hint?: string | null;
    note?: string | null;
    is_transfer?: boolean;
    to_account_name?: string | null;
    switch_to?: "transfer" | "transaction" | null;
};

const toLlmTransaction = (raw: RawExtraction): LlmTransaction => {
    const magnitude =
        typeof raw.amount === "number" && raw.amount > 0
            ? Math.round(raw.amount * 1000)
            : null;
    // An amount with no direction defaults to an expense (money out) rather
    // than being dropped — otherwise the field silently fails to map
    const amount =
        magnitude === null
            ? null
            : raw.direction === "in" ? magnitude : -magnitude;

    let date: Date | null = null;
    if (raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        const parsed = new Date(raw.date);
        if (!isNaN(parsed.getTime())) date = parsed;
    }

    return {
        isTransaction: raw.is_transaction === true && amount !== null,
        amount,
        payee: raw.payee?.trim() || null,
        date,
        accountName: raw.account_name?.trim() || null,
        categoryName: raw.category_name?.trim() || null,
        accountHint: raw.account_hint?.trim() || null,
        note: raw.note?.trim() || null,
        isTransfer: raw.is_transfer === true,
        toAccountName: raw.to_account_name?.trim() || null,
        switchTo: raw.switch_to === "transfer" || raw.switch_to === "transaction"
            ? raw.switch_to
            : null,
    };
};

const hermesConfig = (): { url: string; key: string } | null => {
    const url = process.env.HERMES_BRIDGE_URL?.trim();
    const key = process.env.HERMES_BRIDGE_KEY?.trim();
    if (!url || !key) return null;
    return { url: url.replace(/\/+$/, ""), key };
};

/** Any backend configured for extraction/field-cleanup (distinct from Groq/Whisper). */
export const hasHermesBridge = () => hermesConfig() !== null;

/**
 * POSTs to one Hermes bridge endpoint. Returns the parsed JSON body on any
 * 2xx response, or null on missing config, network error, timeout, non-2xx,
 * or a body that isn't valid JSON. Never throws — callers treat null as
 * "nothing extracted" and fall back accordingly.
 */
const hermesPost = async (path: string, body: unknown): Promise<unknown | null> => {
    const cfg = hermesConfig();
    if (!cfg) return null;

    const controller = new AbortController();
    // Real observed vision-extraction latency is 9-12s, and under
    // concurrent load (a multi-image share batch) some calls were
    // exceeding the old 20s ceiling and silently failing — the bridge's
    // own internal timeout was raised to 45s to match; this is a backstop
    // slightly above that (still safely under Vercel's 60s maxDuration on
    // this route) so the bridge gets a chance to time out and respond
    // cleanly first, rather than the client cutting it off mid-response.
    const timeout = setTimeout(() => controller.abort(), 50_000);
    try {
        const response = await fetch(`${cfg.url}${path}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${cfg.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!response.ok) {
            console.error(`Hermes bridge ${path} failed:`, response.status, (await response.text()).slice(0, 140));
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error(`Hermes bridge ${path} error:`, e);
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

/** Extract a transaction from an SMS / notification / spoken text. */
export const llmExtractFromText = async (text: string, ctx: LlmContext): Promise<LlmTransaction | null> => {
    const data = await hermesPost("/extract/text", { text, context: ctx });
    if (!data || typeof data !== "object") return null;
    return toLlmTransaction(data as RawExtraction);
};

/**
 * Extract a transaction from a payment screenshot (https or data: URL).
 * UPI apps often attach a summary caption when sharing — pass it as
 * `accompanyingText` so both sources are read together.
 */
export const llmExtractFromImage = async (
    imageUrl: string,
    ctx: LlmContext,
    accompanyingText?: string | null,
): Promise<LlmTransaction | null> => {
    const data = await hermesPost("/extract/vision", {
        image_url: imageUrl,
        accompanying_text: accompanyingText?.trim() || null,
        context: ctx,
    });
    if (!data || typeof data !== "object") return null;
    return toLlmTransaction(data as RawExtraction);
};

/**
 * Transcribe spoken audio with Whisper. Returns null on any failure.
 * Pass the user's account/category names as `vocabulary` — priming Whisper
 * with the proper nouns it should expect is what makes names like "Webhub"
 * transcribe correctly instead of being guessed as English words.
 */
export const llmTranscribe = async (
    audio: Blob,
    filename: string,
    vocabulary: string[] = [],
): Promise<string | null> => {
    const keys = groqKeys();
    if (keys.length === 0) return null;

    const names = vocabulary.filter(Boolean).slice(0, 40).join(", ");
    const startedAt = Date.now();

    for (const model of WHISPER_MODELS) {
        const maxTurns = keys.length * 2 + 1;
        for (let turn = 0; turn < maxTurns; turn++) {
            if ((Date.now() - startedAt) / 1000 > 22) return null;
            const pick = pickGroqKey(keys, model);
            if (!pick) break;
            if (pick.waitMs > 0) {
                if (pick.waitMs > 8000) break; // don't stall a live recording too long
                await new Promise((r) => setTimeout(r, pick.waitMs + 250));
            }
            try {
                const form = new FormData();
                form.append("file", audio, filename);
                form.append("model", model);
                // No language pin (any language works); the prompt biases short
                // clips toward the primary case and primes expected proper nouns
                form.append(
                    "prompt",
                    `Mostly English, sometimes Hindi/Hinglish. Indian finance terms: rupees, UPI, paise, paid, credited.${names ? ` Names that may appear: ${names}.` : ""}`,
                );
                form.append("temperature", "0");

                const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${pick.key}` },
                    body: form,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`Transcription failed on ${model}:`, response.status);
                    if (response.status === 429) { coolDownGroqKey(pick.key, parseRetrySeconds(errText), model); continue; }
                    if (response.status === 401 || response.status === 403 || isDeadKeyError(errText)) { coolDownGroqKey(pick.key, 3600, model); continue; }
                    break; // model unavailable — try the next model
                }
                const data = await response.json();
                const text = typeof data?.text === "string" ? data.text.trim() : "";
                // Silence → Whisper hallucination → treat as nothing said
                if (text && isHallucinatedSilence(text)) return null;
                if (text) return text;
            } catch (e) {
                console.error(`Transcription error on ${model}:`, e);
            }
        }
    }
    return null;
};

/**
 * Cleans a dictated field value — turns raw Whisper output ("uh, the chicken
 * shopkeeper.") into a usable value.
 */
export const llmCleanFieldValue = async (
    field: "payee" | "amount" | "notes",
    spoken: string,
): Promise<string | null> => {
    const data = await hermesPost("/extract/field", { field, spoken });
    if (!data || typeof data !== "object") return null;
    const value = (data as { value?: unknown }).value;
    return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** Any Groq key present (Whisper transcription requires Groq specifically). */
export const hasGroqKey = () => groqKeys().length > 0;

export const isGroqConfigured = () => groqKeys().length > 0;
