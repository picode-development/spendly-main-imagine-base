/**
 * Groq-powered transaction understanding (server-side only — uses GROQ_KEY).
 *
 * Every function returns null on ANY failure (missing key, network, refusal,
 * malformed JSON) so callers can fall back to the regex parser in
 * lib/sms-parser.ts. LLM output is advisory: it pre-fills a pending
 * transaction that the user always reviews before saving.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1";
const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "qwen/qwen3.6-27b";
const WHISPER_MODEL = "whisper-large-v3-turbo";
const FAST_MODEL = "llama-3.1-8b-instant";

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
};

const extractionPrompt = (ctx: LlmContext) => `You extract financial transaction details from Indian bank SMS messages, UPI app notifications, payment screenshots, or spoken descriptions.

Today's date: ${new Date().toISOString().slice(0, 10)}

The user's Spendly accounts: ${JSON.stringify(ctx.accounts)}
The user's categories: ${JSON.stringify(ctx.categories)}

Respond with ONLY a JSON object:
{
  "is_transaction": boolean,        // false for OTPs, balance alerts, promotions, reminders
  "amount": number | null,          // positive rupees, e.g. 520.50
  "direction": "in" | "out" | null, // "out" = user paid/spent, "in" = user received
  "payee": string | null,           // who was paid or who paid (person/shop/company/UPI id). When BOTH a name and a role/descriptor are given ("Kishen Khushwant the ice cream shopkeeper"), combine them as "Name - Descriptor" (e.g. "Kishen Khushwant - Ice Cream Shopkeeper")
  "date": "YYYY-MM-DD" | null,      // transaction date if stated, else null
  "account_name": string | null,    // EXACT name from the accounts list if clearly implied, else null
  "category_name": string | null,   // EXACT name from the categories list if it clearly fits, else null
  "account_hint": string | null,    // short context like "a/c ..0934" or masked card number, else null
  "note": string | null,            // the note to save with the transaction. CRITICAL: if the speaker/message EXPLICITLY states a note, reason, occasion, or any extra detail ("note that...", "this was for...", "it was a gift"), include ALL of those stated details — never drop or shorten what was explicitly said. Join multiple details with " - ". Only when nothing was explicitly stated may you write a brief factual summary (max 12 words), or null
  "is_transfer": boolean,           // true ONLY when moving money between the user's OWN accounts ("transfer 500 from My Money to Savings", "move funds to savings")
  "to_account_name": string | null  // for transfers: destination account, EXACT name from the accounts list (account_name is the source)
}

Rules: never invent an amount. Balance figures are NOT the transaction amount. For transfers between the user's own accounts, is_transaction is still true. Match account_name/category_name only from the given lists, case-sensitively as written there.

Formatting rules for all text values (payee, note):
- Use Title Case for names ("ice cream shopkeeper" → "Ice Cream Shopkeeper"); notes as clean sentences with proper capitalization.
- The input is usually English but may be Hindi, Hinglish, or any other language. ALWAYS write output values in Latin script — keep English as-is, transliterate Hindi to Hinglish (e.g. दूध वाला → "Doodh Wala", सब्ज़ी → "Sabzi"). Never output Devanagari or other non-Latin scripts.`;

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
};

const toLlmTransaction = (raw: RawExtraction): LlmTransaction => {
    const magnitude =
        typeof raw.amount === "number" && raw.amount > 0
            ? Math.round(raw.amount * 1000)
            : null;
    const amount =
        magnitude === null || !raw.direction
            ? null
            : raw.direction === "out" ? -magnitude : magnitude;

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
    };
};

const chatCompletion = async (
    model: string,
    userContent: unknown,
    ctx: LlmContext,
): Promise<LlmTransaction | null> => {
    const apiKey = process.env.GROQ_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch(`${GROQ_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: extractionPrompt(ctx) },
                    { role: "user", content: userContent },
                ],
            }),
        });
        if (!response.ok) {
            console.error("Groq extraction failed:", response.status, await response.text());
            return null;
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string") return null;
        return toLlmTransaction(JSON.parse(content) as RawExtraction);
    } catch (e) {
        console.error("Groq extraction error:", e);
        return null;
    }
};

/** Extract a transaction from an SMS / notification / spoken text. */
export const llmExtractFromText = (text: string, ctx: LlmContext) =>
    chatCompletion(TEXT_MODEL, text, ctx);

/**
 * Extract a transaction from a payment screenshot (https or data: URL).
 * UPI apps often attach a summary caption when sharing — pass it as
 * `accompanyingText` so both sources are read together.
 */
export const llmExtractFromImage = (imageUrl: string, ctx: LlmContext, accompanyingText?: string | null) =>
    chatCompletion(VISION_MODEL, [
        {
            type: "text",
            text: accompanyingText?.trim()
                ? `Extract the transaction from this payment screenshot. It was shared with this accompanying text (use both sources; the screenshot wins on conflicts): "${accompanyingText.trim()}"`
                : "Extract the transaction from this payment screenshot.",
        },
        { type: "image_url", image_url: { url: imageUrl } },
    ], ctx);

/** Transcribe spoken audio with Whisper. Returns null on any failure. */
export const llmTranscribe = async (audio: Blob, filename: string): Promise<string | null> => {
    const apiKey = process.env.GROQ_KEY;
    if (!apiKey) return null;

    try {
        const form = new FormData();
        form.append("file", audio, filename);
        form.append("model", WHISPER_MODEL);
        // No language pin (any language works); the prompt biases short
        // clips toward the primary case: English with Indian finance terms
        form.append("prompt", "Mostly English, sometimes Hindi/Hinglish. Indian finance terms: rupees, UPI, paise, kirana, paid, credited.");
        form.append("temperature", "0");

        const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
            body: form,
        });
        if (!response.ok) {
            console.error("Groq transcription failed:", response.status, await response.text());
            return null;
        }
        const data = await response.json();
        return typeof data?.text === "string" && data.text.trim() ? data.text.trim() : null;
    } catch (e) {
        console.error("Groq transcription error:", e);
        return null;
    }
};

const LANGUAGE_RULE = `The speech may be English, Hindi, or mixed Hinglish — always write the value in Latin script, transliterating Hindi to Hinglish (दूध वाला → "Doodh Wala"), never Devanagari.`;

const FIELD_PROMPTS: Record<string, string> = {
    payee: `The user dictated the payee for a transaction. Extract ONLY the person/shop/company name in Title Case — no filler words ("uh", "the payee is"), no trailing punctuation. ${LANGUAGE_RULE} Reply JSON: {"value": string | null}. Examples: "uh the chicken shopkeeper." → {"value": "Chicken Shopkeeper"}; "paid to sneha didi" → {"value": "Sneha Didi"}.`,
    amount: `The user dictated an amount of money in rupees (possibly in Hindi, e.g. "dhai sau" = 250). Extract it as a plain number string with no currency symbol or commas. Reply JSON: {"value": string | null}. Examples: "two hundred fifty rupees" → {"value": "250"}; "1,250.50" → {"value": "1250.50"}.`,
    notes: `The user dictated a note for a transaction. Rewrite it as a clean short note with proper sentence capitalization — drop filler words, fix obvious transcription slips, keep the meaning and any names/amounts. ${LANGUAGE_RULE} Reply JSON: {"value": string | null}.`,
};

/**
 * Cleans a dictated field value with a fast small model — turns raw Whisper
 * output ("uh, the chicken shopkeeper.") into a usable value.
 */
export const llmCleanFieldValue = async (
    field: "payee" | "amount" | "notes",
    spoken: string,
): Promise<string | null> => {
    const apiKey = process.env.GROQ_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch(`${GROQ_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: FAST_MODEL,
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: FIELD_PROMPTS[field] },
                    { role: "user", content: spoken },
                ],
            }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string") return null;
        const value = (JSON.parse(content) as { value?: string | null }).value;
        return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
};

export const isGroqConfigured = () => !!process.env.GROQ_KEY;
