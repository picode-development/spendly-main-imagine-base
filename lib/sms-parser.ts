/**
 * Parser for Indian bank / UPI transaction SMS messages.
 * Pure string logic — safe on both server (ingest endpoint) and client
 * (share-to-Spendly flow).
 */

export type ParsedSms = {
    /** Signed miliunits: negative = money out (debit), positive = money in */
    amount: number | null;
    payee: string | null;
    /** e.g. "a/c ..1234" — helps the user pick the right Spendly account */
    accountHint: string | null;
    date: Date | null;
    /** True when the text looks like a transaction message at all */
    isTransaction: boolean;
};

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
// SBI-style "debited by 150.0" / "credited with 2000" — no currency prefix
const AMOUNT_FALLBACK_RE = /\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)\b/i;

const DEBIT_RE = /\b(?:debited|debit|paid|sent|spent|withdrawn|purchase(?:d)?|deducted)\b/i;
const CREDIT_RE = /\b(?:credited|credit|received|deposited|refund(?:ed)?|cashback)\b/i;

// "to SWIGGY", "at AMAZON", "from LOKESH", "towards X" — stop at common tails
const PAYEE_RE = /\b(?:to|at|from|towards|info:?)\s*[:\-]?\s*([A-Za-z0-9@._\- &']{2,40}?)(?=\s+(?:on|via|ref(?:no)?|upi|txn|a\/c|ac|using|for|dated|avl|bal|\d{6,})\b|[.,;\n]|$)/gi;

// Captures like "your", "you" mean the regex grabbed the account owner, not a payee
const PAYEE_STOPWORDS = new Set(["your", "you", "u", "ur", "the", "my"]);

const VPA_RE = /\b([\w.\-]{2,}@[a-z]{2,})\b/i;

const ACCOUNT_RE = /\b(?:a\/c|acct|account|ac)\s*(?:no\.?)?\s*[x*.]*\s*(\d{3,6})\b/i;

// "on 12-08-26", "on 12/08/2026", "on 12-Aug-26", "on date 12Aug26"
const DATE_RE = /\bon\s+(?:date\s+)?(\d{1,2})[-\/]?([a-z]{3}|\d{1,2})[-\/]?(\d{2,4})\b/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseTransactionSms(message: string): ParsedSms {
    const text = message.trim();

    const amountMatch = text.match(AMOUNT_RE) ?? text.match(AMOUNT_FALLBACK_RE);
    const isDebit = DEBIT_RE.test(text);
    const isCredit = CREDIT_RE.test(text);

    // A transaction message needs at least an amount and a direction
    const isTransaction = !!amountMatch && (isDebit || isCredit);

    let amount: number | null = null;
    if (amountMatch) {
        const value = parseFloat(amountMatch[1].replace(/,/g, ""));
        if (!isNaN(value) && value > 0) {
            const miliunits = Math.round(value * 1000);
            // Debit wins when both words appear ("debited ... credited to ...")
            amount = isDebit ? -miliunits : isCredit ? miliunits : null;
        }
    }

    let payee: string | null = null;
    for (const match of text.matchAll(PAYEE_RE)) {
        const candidate = match[1].trim().replace(/\s{2,}/g, " ");
        if (!PAYEE_STOPWORDS.has(candidate.toLowerCase())) {
            payee = candidate;
            break;
        }
    }
    // "to VPA name.surname@bank" — the payee regex stops at the dot; the full
    // UPI id is a better payee than the truncated "VPA name"
    if (!payee || /^vpa\b/i.test(payee)) {
        const vpaMatch = text.match(VPA_RE);
        if (vpaMatch) payee = vpaMatch[1];
    }

    const accountMatch = text.match(ACCOUNT_RE);
    const accountHint = accountMatch ? `a/c ..${accountMatch[1]}` : null;

    let date: Date | null = null;
    const dateMatch = text.match(DATE_RE);
    if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const monthRaw = dateMatch[2].toLowerCase();
        const month = /^\d+$/.test(monthRaw)
            ? parseInt(monthRaw, 10) - 1
            : MONTHS.indexOf(monthRaw.slice(0, 3));
        let year = parseInt(dateMatch[3], 10);
        if (year < 100) year += 2000;
        if (month >= 0 && day >= 1 && day <= 31) {
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) date = parsed;
        }
    }

    return { amount, payee, accountHint, date, isTransaction };
}
