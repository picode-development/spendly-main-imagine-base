# SMS Auto-Capture — Setup Guide

> **LLM parsing (recommended):** with `GROQ_KEY` set (locally in `.env.local`
> and on the deploy host), messages, shared payment screenshots, and voice
> input are understood by Groq models (Llama for text, Qwen vision for
> screenshots, Whisper for speech) — including account/category matching.
> Without the key, everything below still works via the built-in regex parser.

Spendly can detect bank/UPI transaction messages and show them as a review
popup ("N detected transactions") so you never forget to log one. Tapping
**Add** opens the transaction sheet pre-filled — pick the account/category and
save. Dismiss anything that isn't real.

There are two ways to feed messages in. Both end up in the same popup.

## Option A — Automatic forwarding (MacroDroid, recommended)

Bank SMS are forwarded to Spendly the moment they arrive. One-time setup:

1. Install **MacroDroid** (free) from the Play Store.
2. Add Macro → **Trigger**: "SMS Received" → "Any content". Optionally
   restrict to senders containing your banks (e.g. `HDFCBK`, `SBIUPI`, `ICICI`)
   to avoid forwarding personal messages.
3. **Action**: "HTTP Request" →
   - Method: `POST`
   - URL: `https://YOUR-DEPLOYED-DOMAIN/api/pending-transactions/ingest?token=YOUR_SMS_INBOX_TOKEN`
   - Content type: `application/json`
   - Body: `{"message": "[sms_message]"}`
     (`[sms_message]` is a MacroDroid magic variable — pick it from the
     variable list so the SMS text is inserted.)
4. Save and enable the macro. Send yourself a test UPI payment: within a few
   seconds the transaction should appear in Spendly's popup.

Notes:
- The token is the `SMS_INBOX_TOKEN` value from `.env.local`. It must also be
  set on the deployment host (with `SMS_INBOX_USER_ID`) for production.
- Non-transaction SMS (OTPs, balance alerts, promos) are recognized and
  ignored by the parser — they never create popup entries.
- Localhost testing: use your PC's LAN IP (e.g. `http://192.168.x.x:3000/...`)
  while the dev server runs.

## Option B — Share to Spendly (no extra app)

1. Open Spendly in Chrome on your phone → menu → **Add to Home screen**
   (installs it as an app).
2. In your SMS app (or GPay/PhonePe), long-press the transaction message →
   **Share** → **Spendly**.
3. Spendly parses it and the popup shows the detected transaction.

## How parsing works

`lib/sms-parser.ts` extracts from Indian bank/UPI formats:
- amount + direction (debited/paid/sent → expense; credited/received → income)
- payee ("to SWIGGY", "from LOKESH", UPI VPAs like `name@ybl`)
- account hint ("A/c XX1234") — added to the notes so you pick the right account
- transaction date when present in the message

Messages without an amount + direction (OTPs, balance alerts) are ignored by
the automatic ingest. Shared messages are always stored, even if parsing was
incomplete, since sharing was an explicit choice.

## Future: Truecaller-style native capture

Fully automatic reading without a forwarder app requires a native Android app
(browsers cannot read the SMS inbox). The endpoint above is ready for that —
a small companion app would POST to the same `/ingest` route.
