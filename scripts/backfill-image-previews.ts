// One-off backfill: generate tiny blur-up previews for images uploaded
// before previews existed. Downloads each full image once, downscales to
// ~32px with sharp, and stores the data URL back into image_urls.
// Run with: bun ./scripts/backfill-image-previews.ts

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import sharp from "sharp";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

type TransactionImage = { url: string; preview?: string };

const makePreview = async (url: string): Promise<string> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const preview = await sharp(buffer)
        .resize(32, 32, { fit: "inside" })
        .jpeg({ quality: 60 })
        .toBuffer();
    return `data:image/jpeg;base64,${preview.toString("base64")}`;
};

const main = async () => {
    const rows = (await sql`
        SELECT id, image_urls FROM transactions WHERE image_urls IS NOT NULL
    `) as { id: string; image_urls: TransactionImage[] }[];

    const pending = rows.filter(r => r.image_urls.some(img => !img.preview));
    console.log(`${rows.length} transactions with images, ${pending.length} need previews`);

    let done = 0;
    let failed = 0;

    for (const row of pending) {
        const updated: TransactionImage[] = [];
        for (const img of row.image_urls) {
            if (img.preview) {
                updated.push(img);
                continue;
            }
            try {
                updated.push({ ...img, preview: await makePreview(img.url) });
            } catch (e) {
                failed++;
                console.error(`  FAILED ${img.url}: ${e instanceof Error ? e.message : e}`);
                updated.push(img); // keep the entry, just without a preview
            }
        }
        await sql`
            UPDATE transactions
            SET image_urls = ${JSON.stringify(updated)}::jsonb
            WHERE id = ${row.id}
        `;
        done++;
        if (done % 10 === 0 || done === pending.length) {
            console.log(`  ${done}/${pending.length} transactions updated`);
        }
    }

    console.log(`Done. ${done} transactions updated, ${failed} image(s) failed (left without preview).`);
};

main();
