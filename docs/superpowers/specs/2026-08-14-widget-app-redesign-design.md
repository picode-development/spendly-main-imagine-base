# Spendly Widgets in-app UI redesign

## Problem

The Spendly Widgets companion app (`spendly-widgets/`) is functional but visually flat compared to the main Spendly web app. The OS home-screen widgets (`src/widgets/*`) already went through a dedicated design pass and have a proper theme/gradient system — this redesign is scoped to the **in-app screens**, which still use a plain shared UI kit (`src/ui.tsx`): flat bordered cards, plain text amounts, no gradients/elevation, and an invented "gold" accent that doesn't exist in the main app's palette.

## Scope

- `src/ui.tsx` — shared primitives (Card, Button, amount pill, icon box)
- `App.tsx` — main/home screen (pairing, stats, widget previews, metric toggles)
- `src/ConfigScreen.tsx`
- `src/SearchScreen.tsx`
- `src/VoiceScreen.tsx`

Out of scope: `src/widgets/*` (already redesigned), backend/API code.

## Design language (ported from the main web app)

Source of truth: main app's `app/globals.css` (dark mode tokens) + component patterns in `components/ui/*`, `components/data-card.tsx`, `app/(dashboard)/transactions/columns.tsx`, `components/Header.tsx`, `components/navigation.tsx`.

- **Colors** (already close, keep/confirm): bg `#0f172a`, card `#1e293b`, border `#334155` @ low opacity, text `#f8fafc`, muted `#94a3b8`, accent blue `#3b82f6`, destructive/expense `#f87171`, income `#4ade80` (green, matches dashboard stat-card convention) or blue-500 (matches transaction-list convention) — use **green for income, red for expense** consistently across the widget app (clearer at a glance than the main site's own inconsistency between conventions).
- **Drop the "gold" accent** — replace with the accent blue for selected/active states, for actual parity with the main app.
- **Hero header**: blue gradient (`#172554` → `#1e3a8a`, matching the main site's dark-mode header gradient) at the top of the main screen, with the primary content card(s) floating over it via negative top margin — mirrors the site's hero/floating-card layout.
- **Amount pills**: rounded-full colored badges (bg color @ ~15-20% opacity, text in the full color) instead of plain colored numbers — matches the site's transaction amount badges.
- **Icon boxes**: icons sit in a colored rounded-square container (bg color @ ~20% opacity) rather than bare, matching dashboard stat-card icon treatment.
- **Elevation**: cards get a real shadow (RN `shadow*` + Android `elevation`) instead of just a hairline border; radius aligned to the site's `rounded-xl` (~14px).
- **Buttons**: keep RN-appropriate touch targets, but align radius/weight to the site's button primitives.

## Implementation approach

Extend `UI` tokens in `ui.tsx` (add `income` green, keep `accent` blue, drop `gold` usages), add reusable `AmountPill` and `IconBox` components alongside the existing `Card`/`Button`/`Select`, add a `GradientHeader` wrapper component (using `expo-linear-gradient`, already likely available via `expo-audio`'s peer deps — verify at implementation time) for the hero treatment on `App.tsx`. Apply these consistently across the 4 in-scope screens. No changes to data flow, navigation, or business logic — purely visual.

## Verification

Since this environment can't render the native app, verification is: clean typecheck (`tsc --noEmit`) after each screen, then ship as a JS-only EAS Update (same mechanism used for the voice-upload fix) so the user can review on-device and give feedback for another pass if needed.
