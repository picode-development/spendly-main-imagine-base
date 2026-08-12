# Fund Transfers Between Accounts + True "All Time" Range

Date: 2026-08-12 · Status: approved by user in conversation

## Problem

1. Accounts in Spendly are divisions of one real bank account. Users move money
   between them by manually creating an expense in one account and an income in
   the other. The summary math (`positive = income, negative = expense`) counts
   these internal moves as real profit/spending, corrupting the dashboard.
2. The dashboard "All Dates" button is a workaround: it hardcodes
   `APP_DEVELOPMENT_DATE = "2025-04-14"` (`components/all-date-filters.tsx:19`)
   and fabricates a from-date the day before it. Both the summary and
   transactions APIs silently default to "last 30 days" when no dates are given,
   so no true all-time mode exists.

## Feature A — Transfers

### Data model
- New nullable column `transfer_id` (text) on `transactions`.
- A transfer of X from account A to B creates **two linked rows** sharing one
  `transfer_id` (cuid): `−X` in A with payee "Transfer to {B}", `+X` in B with
  payee "Transfer from {A}". `category_id` stays null. Date, notes, and receipt
  images are shared across both legs at creation.

### Stats logic (`app/api/[[...route]]/summary.ts`)
- Income and expense sums, the category breakdown, and the daily chart **skip
  rows with `transfer_id IS NOT NULL`**.
- `remaining` (balance) keeps including transfers, so per-account balances move
  correctly; across all accounts transfers net to zero.

### API (`app/api/[[...route]]/transactions.ts`)
- `POST /transactions/transfer`: `{ fromAccountId, toAccountId, amount (positive
  miliunits), date, notes?, imageUrls? }`. Validates both accounts belong to the
  user and differ; inserts both legs in one statement.
- List and by-id GETs also return `transferId`.
- `PATCH /:id`: when the row is a transfer leg, sync the partner (mirrored
  amount, same date/notes/images; payees untouched).
- `DELETE /:id` and bulk delete: deleting any leg deletes its partner too.

### UI
- "Transfer" button (⇄) on the transactions page header next to "Add New".
- Transfer sheet mirrors the new-transaction form fields: Date, From account,
  To account, Amount (positive), Receipt images, Notes. No Category/Payee.
- Transfer rows render in the transactions table like any other row, with a ⇄
  "Transfer" indicator in the category cell instead of the red "Uncategorized"
  warning.
- Editing a leg via the existing edit sheet is allowed; the PATCH sync keeps the
  pair consistent.

### Existing data
Old manually-entered transfer pairs stay as-is. Optional follow-up (not in this
change): a detection script that finds same-amount/same-date/opposite-sign pairs
across accounts and links them after user confirmation.

## Feature B — "All time" range

- Rename the button to **"All time"**. It toggles a clean `range=all` URL param
  and removes `from`/`to`; no fabricated dates.
- `useGetSummary` / `useGetTransactions`: when `range=all`, call the APIs with
  `allDates=true` and no dates (bypassing their default-range fallbacks).
- Summary API already supports `allDates` (skips date filter and period-change
  percentages). The transactions list API gains the same `allDates` param to
  skip its last-30-days default.
- Choosing a concrete range in the date filter clears `range=all`. Other filter
  components (account/category/date) preserve the `range` param when they
  rebuild URLs.

## Out of scope
- Backfill/linking of historical transfer pairs (offered as follow-up).
- A dedicated transfers table (linked-pair rows keep every existing list,
  filter, and CSV flow working unchanged).
