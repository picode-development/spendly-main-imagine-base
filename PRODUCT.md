# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary users are individuals (currently the founder and close family) tracking personal/shared household finances in India — evidenced by INR-only currency handling, bank/UPI SMS parsing tuned to Indian banks (HDFCBK, SBIUPI, ICICI, etc.), and family-oriented reporting scripts in the repo (`generate_mom_dad_report.js`, `temp_my_money_inflow.js`). Usage today is personal/family, but the product is being built with the intent of eventually opening up to a broader public audience — design and product decisions should not hard-code "just us" assumptions.

## Product Purpose

Spendly is a personal finance tracker built to minimize the friction of logging every transaction. Instead of manual entry, it auto-detects bank/UPI SMS messages, accepts voice dictation and receipt photos, and stages everything for one-tap confirmation. Success means the user always knows where their money went — via the web dashboard or a glance at a home-screen widget — without manual bookkeeping.

## Positioning

Frictionless, ambient capture: transactions arrive via SMS auto-detection (LLM parsing with a regex fallback when no LLM key is configured), voice notes, or receipt photos — never a blank form as the primary path. Combined with native OS home-screen widgets that surface real spend data without opening the app, this gives Spendly a "you don't have to do anything to stay on top of your money" position that a budgeting app requiring manual entry or a bank-API-only integration couldn't truthfully claim.

## Operating Context

- **Web dashboard** (Next.js, Clerk-authenticated): accounts, categories, transactions, transfers between own accounts, CSV import of transaction history, a "share"/"share-claim" flow for sharing financial data with another user.
- **SMS auto-capture**: bank/UPI SMS forwarded (typically via MacroDroid on Android) to an ingest endpoint, parsed into a review popup of detected transactions the user confirms or dismisses.
- **Voice and photo capture**: dictate a transaction or photograph a receipt/payment screenshot; parsed the same way (LLM-first via Groq/Hermes-bridge, regex/manual fallback).
- **Spendly Widgets companion app** (Expo/React Native, Android shipped today, iOS "coming soon"): paired to a web account via a manually-entered code (not full auth), provides 5 home-screen widget types (Summary, Chart, Categories, Transactions, Actions), each independently configurable (style, time scope, account/category filters) per widget instance, plus voice capture directly from the widget's popup. Updates ship as OTA JS bundles (`expo-updates`).

## Capabilities and Constraints

- Currency is fixed to INR (`formatINR` grouping, ₹ symbol) — not currently multi-currency.
- SMS/voice/image parsing has two tiers: LLM-backed (Groq for text/vision/speech, or a local Hermes-bridge for text/vision + local Whisper for speech) when configured, otherwise a built-in regex parser for SMS only (voice/image require one of the LLM backends).
- Native widgets render via `react-native-android-widget` (`FlexWidget`/`TextWidget`/`SvgWidget` primitives) — no HTML/CSS/DOM, no Tailwind/shadcn; visual parity with the web app has to be hand-ported per element, not shared as code.
- Widget data isn't real-time — refresh timing follows the OS's own widget-update scheduling, with a local cache for offline display.
- iOS widgets are not yet shipped; do not assume iOS-specific behavior is live.

## Brand Commitments

- Product name: **Spendly**.
- Established dark-mode palette (from `app/globals.css` and the widgets' `theme.ts`, ported deliberately from web to widgets in a prior design pass): background `#0f172a`, card `#1e293b`, border `#334155`, primary text `#f8fafc`, muted text `#94a3b8`, accent blue `#3b82f6`, expense/destructive red (`#f87171` widgets / `#f43f5e`–`#f97316` family in dashboard chart variants), income/success green `#4ade80`.
- Semantic color convention, applied consistently across dashboard, transaction lists, and widgets: **green = income/good, red = expense/bad** (chosen over the site's own earlier internal inconsistency between a green-income and a blue-income convention).
- No locked logo/wordmark file or tagline confirmed yet — palette and name are the binding constraints, not a full identity system.

## Evidence on Hand

- `docs/superpowers/specs/2026-08-14-widget-app-redesign-design.md` — prior design pass rationale and exact token values for porting the web app's visual language into the widgets companion app.
- `docs/sms-auto-capture.md` — SMS capture setup and parsing-tier behavior.
- `docs/superpowers/specs/2026-08-12-transfers-and-all-time-design.md` — transfers and all-time range design decisions.
- No testimonials, case studies, benchmarks, or pricing exist — future work must not fabricate them.

## Product Principles

1. **Auto-detect over ask.** Every capture path (SMS, voice, photo) tries to fill itself in before falling back to a manual form.
2. **Glanceable over exhaustive.** Widgets and dashboard summaries protect the one number that matters (spend, remaining, change vs. last period) over showing everything at once.
3. **One semantic color language everywhere.** Green/red for income/expense means the same thing on the dashboard, in transaction rows, and in every widget — never re-decided per surface.
4. **Native-feeling per surface, not a ported skin.** The web app behaves like a modern SaaS dashboard; widgets behave like real OS home-screen widgets (system corner treatment, no fake in-widget app chrome) — visual language is shared, but the idiom per platform is respected.
5. **Built for shared financial oversight, not just solo tracking.** Multi-account, transfers, and sharing between users are first-class product surfaces, not afterthoughts bolted onto a single-user tracker.
