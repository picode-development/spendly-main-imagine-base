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

/** "What comes before / after the value" — the value sits between them. */
export type FieldAnchor = {
    prefix: string;
    suffix?: string | null;
};

/**
 * A user-taught format (Settings → SMS formats). When `matchText` appears in a
 * message, the rule's direction and per-field anchors override the built-in
 * heuristics; unmapped fields still come from the generic parser.
 */
export type SmsRule = {
    matchText: string;
    direction: "auto" | "income" | "expense";
    anchors?: {
        payee?: FieldAnchor | null;
        amount?: FieldAnchor | null;
        account?: FieldAnchor | null;
        date?: FieldAnchor | null;
    } | null;
};

/** Extracts the text between an anchor's prefix and suffix (case-insensitive). */
export function extractAnchor(text: string, anchor: FieldAnchor): string | null {
    const idx = text.toLowerCase().indexOf(anchor.prefix.toLowerCase());
    if (idx < 0) return null;
    const rest = text.slice(idx + anchor.prefix.length);
    let end = anchor.suffix
        ? rest.toLowerCase().indexOf(anchor.suffix.toLowerCase())
        : -1;
    if (end < 0) end = rest.search(/[.,;\n]/);
    if (end < 0) end = rest.length;
    const value = rest.slice(0, Math.min(end, 60)).trim().replace(/\s{2,}/g, " ");
    return value.length >= 1 ? value : null;
}

const MONTHS_LOOSE = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parses "12-08-26", "12 Aug 2026", "12/08" etc. from an anchored capture. */
function parseLooseDate(value: string): Date | null {
    const m = value.match(/(\d{1,2})[-\/ ]?([a-z]{3,9}|\d{1,2})[-\/ ]?(\d{2,4})?/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const monthRaw = m[2].toLowerCase();
    const month = /^\d+$/.test(monthRaw)
        ? parseInt(monthRaw, 10) - 1
        : MONTHS_LOOSE.indexOf(monthRaw.slice(0, 3));
    let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
}

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
// SBI-style "debited by 150.0" / "credited with 2000" — no currency prefix
const AMOUNT_FALLBACK_RE = /\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)\b/i;

const DEBIT_RE = /\b(?:debited|debit|paid|sent|spent|withdrawn|withdrawal|purchase(?:d)?|deducted)\b/i;
// "cashback" deliberately excluded: promos say "get cashback Rs.X"; real
// cashback credits always say "credited"
const CREDIT_RE = /\b(?:credited|credit|received|deposited|refund(?:ed)?)\b/i;

// Direction-aware payee markers. Debits name the receiver ("to SWIGGY",
// "at AMAZON", "towards X"); credits name the sender ("from LOKESH",
// "by EMPLOYER"). Matching only the right set avoids grabbing the user's own
// bank from phrases like "debited from Kotak Bank AC X1234 to ...".
const PAYEE_CHARS = "[A-Za-z0-9@._/\\- &']";
const PAYEE_STOP = "(?=\\s+(?:on|via|ref(?:no)?|upi|txn|a\\/c|ac|acct|using|for|dated|avl|bal|from|to|with|through|in|is|was|and|\\d{6,})\\b|[.,;()\\n]|$)";
const DEBIT_PAYEE_RE = new RegExp(`\\b(?:towards|trf\\s+to|to|at)\\s*[:\\-]?\\s*(${PAYEE_CHARS}{2,40}?)${PAYEE_STOP}`, "gi");
const CREDIT_PAYEE_RE = new RegExp(`\\b(?:from|by)\\s*[:\\-]?\\s*(${PAYEE_CHARS}{2,40}?)${PAYEE_STOP}`, "gi");

// Card spends bury the merchant after the date: "Card XX7003 on 12-Aug-26 on
// AMAZON PAY" — grab the token after the second on/at
const CARD_PAYEE_RE = /\bcard\s+(?:no\.?\s*)?[x*]*\d+\s+(?:on|dated)\s+\S+\s+(?:on|at)\s+([A-Za-z0-9@._/\- &']{2,40}?)(?=[.,;()\n]|\s+(?:avl|ref|txn)\b|$)/i;

// Reject captures that are the account owner or the user's own bank/account
const PAYEE_STOPWORDS = new Set(["your", "you", "u", "ur", "the", "my", "me", "atm"]);
const isBadPayee = (candidate: string): boolean => {
    const lower = candidate.toLowerCase();
    return PAYEE_STOPWORDS.has(lower)
        || /^[\d,.\s]+$/.test(candidate)          // it's an amount/ref, not a name
        || /\bbank\b/i.test(candidate)            // "HDFC Bank", "Kotak Bank AC..."
        || /^a\/?c\b/i.test(candidate)
        || /\baccount\b/i.test(candidate);
};

const VPA_RE = /\b([\w.\-]{2,}@[a-z]{2,})\b/i;

const ACCOUNT_RE = /\b(?:a\/c|acct|account|ac)\s*(?:no\.?)?\s*[x*.]*\s*(\d{3,6})\b/i;

// "on 12-08-26", "on 12/08/2026", "on 12-Aug-26", "on date 12Aug26"
const DATE_RE = /\bon\s+(?:date\s+)?(\d{1,2})[-\/]?([a-z]{3}|\d{1,2})[-\/]?(\d{2,4})\b/i;
// BoB-style trailing timestamp: "(10-08-2026 15:42:18)"
const DATE_FALLBACK_RE = /\((\d{1,2})-(\d{1,2})-(\d{4})\s+\d{1,2}:\d{2}/;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseTransactionSms(message: string, rules: SmsRule[] = []): ParsedSms {
    const text = message.trim();

    const rule = rules.find(
        (r) => r.matchText && text.toLowerCase().includes(r.matchText.toLowerCase()),
    ) ?? null;

    const isDebit = DEBIT_RE.test(text);
    const isCredit = CREDIT_RE.test(text);

    let magnitude: number | null = null;

    // A taught amount position beats the built-in currency patterns
    if (rule?.anchors?.amount) {
        const raw = extractAnchor(text, rule.anchors.amount);
        if (raw) {
            const value = parseFloat(raw.replace(/[^\d.]/g, ""));
            if (!isNaN(value) && value > 0) magnitude = Math.round(value * 1000);
        }
    }
    if (magnitude === null) {
        const amountMatch = text.match(AMOUNT_RE) ?? text.match(AMOUNT_FALLBACK_RE);
        if (amountMatch) {
            const value = parseFloat(amountMatch[1].replace(/,/g, ""));
            if (!isNaN(value) && value > 0) magnitude = Math.round(value * 1000);
        }
    }

    // A transaction message needs an amount and a direction — from the message
    // itself or from a matching user rule
    const ruleDirection = rule && rule.direction !== "auto" ? rule.direction : null;
    const isTransaction = magnitude !== null && (isDebit || isCredit || !!ruleDirection);

    let amount: number | null = null;
    if (magnitude !== null) {
        if (ruleDirection) {
            amount = ruleDirection === "expense" ? -magnitude : magnitude;
        } else if (isDebit) {
            // Debit wins when both words appear ("debited ... credited to ...")
            amount = -magnitude;
        } else if (isCredit) {
            amount = magnitude;
        }
    }

    let payee: string | null = null;

    // A user-taught payee position beats every built-in heuristic
    if (rule?.anchors?.payee) {
        const candidate = extractAnchor(text, rule.anchors.payee);
        if (candidate && candidate.length >= 2) payee = candidate;
    }

    // Card spends have the most specific format — try that first
    if (!payee && /\bcard\b/i.test(text)) {
        const cardMatch = text.match(CARD_PAYEE_RE);
        if (cardMatch && !isBadPayee(cardMatch[1].trim())) {
            payee = cardMatch[1].trim().replace(/\s{2,}/g, " ");
        }
    }

    if (!payee) {
        // Debit wins the direction (a "debited ... credited" self-transfer is
        // still a debit from the user's perspective), so pick markers to match
        const payeeRe = isDebit ? DEBIT_PAYEE_RE : CREDIT_PAYEE_RE;
        payeeRe.lastIndex = 0;
        for (const match of text.matchAll(payeeRe)) {
            const candidate = match[1].trim().replace(/\s{2,}/g, " ");
            if (!isBadPayee(candidate)) {
                payee = candidate;
                break;
            }
        }
    }

    // "to VPA name.surname@bank" — the payee regex stops at the dot; the full
    // UPI id is a better payee than the truncated "VPA name"
    if (!payee || /^vpa\b/i.test(payee)) {
        const vpaMatch = text.match(VPA_RE);
        if (vpaMatch) payee = vpaMatch[1];
    }

    let accountHint: string | null = null;
    if (rule?.anchors?.account) {
        accountHint = extractAnchor(text, rule.anchors.account);
    }
    if (!accountHint) {
        const accountMatch = text.match(ACCOUNT_RE);
        accountHint = accountMatch ? `a/c ..${accountMatch[1]}` : null;
    }

    let date: Date | null = null;
    if (rule?.anchors?.date) {
        const raw = extractAnchor(text, rule.anchors.date);
        if (raw) date = parseLooseDate(raw);
    }
    if (!date) {
        const dateMatch = text.match(DATE_RE) ?? text.match(DATE_FALLBACK_RE);
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
    }

    return { amount, payee, accountHint, date, isTransaction };
}
