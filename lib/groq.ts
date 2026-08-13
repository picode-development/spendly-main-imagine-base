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
  "payee": string | null,           // who was paid or who paid (person/shop/company/UPI id)
  "date": "YYYY-MM-DD" | null,      // transaction date if stated, else null
  "account_name": string | null,    // EXACT name from the accounts list if clearly implied, else null
  "category_name": string | null,   // EXACT name from the categories list if it clearly fits, else null
  "account_hint": string | null,    // short context like "a/c ..0934" or masked card number, else null
  "note": string | null             // clean one-line note (max 12 words) worth keeping with the transaction, e.g. "NEFT from RBROTHERS, a/c ..0934" or "Dinner with family, paid via GPay"; null if nothing useful
}

Rules: never invent an amount. Balance figures are NOT the transaction amount. For transfers between the user's own accounts, is_transaction is still true. Match account_name/category_name only from the given lists, case-sensitively as written there.`;

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

/** Extract a transaction from a payment screenshot (https or data: URL). */
export const llmExtractFromImage = (imageUrl: string, ctx: LlmContext) =>
    chatCompletion(VISION_MODEL, [
        { type: "text", text: "Extract the transaction from this payment screenshot." },
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
        form.append("language", "en");
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

export const isGroqConfigured = () => !!process.env.GROQ_KEY;
