# Share Intake Module Plan

## Why the current structure is risky

The share flow was spread across too many independent places:

- `public/sw.js` had its own parser for shared files and text.
- `app/share-target/route.ts` had its own fallback parser.
- `app/(dashboard)/share-claim/page.tsx` had a second extraction layer.
- `app/api/[[...route]]/pending-transactions.ts` also interpreted the payload data.

That means the app was repeatedly guessing the same rules in different places. The logic drift created the exact kind of loopholes the Android share sheet exposed: missing text fields, dropped screenshots, and inconsistent behavior between UPI apps.

## The replacement design

We replace the scattered logic with one clear intake contract:

1. Normalize the raw payload once.
2. Validate text + image candidates by type, not by field name alone.
3. Persist a single canonical share object.
4. Claim it in one authenticated route.
5. Run AI extraction once and attach the result to the transaction form.

## New module structure

```text
features/
  share-intake/
    normalize-share.ts      // raw FormData -> canonical { text, images }
    index.ts                // public exports

app/
  share-target/route.ts     // thin hook that calls the intake normalizer
  (dashboard)/share-claim/page.tsx // reads the canonical stash, not ad hoc fields

lib/
  share-intake.ts           // optional future server/client shared contract
```

## Canonical contract

Each incoming share is normalized into:

```ts
{
  text: string;
  images: [{ name?: string; type?: string; data: Uint8Array; size?: number }];
}
```

Rules:

- accept text from any string-like field that looks like a message/title/body/url
- accept any image-like file regardless of whether the field is named `file`, `image`, `photo`, or `attachment`
- dedupe by `name + type + size`
- preserve source order for users to review in the claim sheet

## Old flow to retire

The legacy modules should be treated as deprecated after the intake contract is in place:

- `public/sw.js` share-target logic
- `app/share-target/route.ts` custom field detection
- duplicated extraction heuristics in the claim page

The goal is not to keep three different interpretations of the same Android share payload.

## Implementation target

The intake normalizer is the single source of truth. Once it is in place, the rest of the pipeline becomes straightforward:

- `share-target` route stores the normalized payload in `sharedStash`
- `/share-claim` reads the stored payload and creates pending transactions
- the transaction card uses a single extraction pipeline for screenshots
- the user sees one clean review experience regardless of app source

This keeps the design aligned with the actual Android share flow instead of relying on fragile assumptions about exact field names.
