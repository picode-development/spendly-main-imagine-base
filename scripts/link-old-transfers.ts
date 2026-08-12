// Detects historical manual transfers — two transactions on the same date
// with the same amount, one negative and one positive, in different accounts,
// not already marked as transfers — and links them with a shared transfer_id.
//
//   bun ./scripts/link-old-transfers.ts          # dry run: list what would be linked
//   bun ./scripts/link-old-transfers.ts --apply  # actually link the pairs

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { createId } from "@paralleldrive/cuid2";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const APPLY = process.argv.includes("--apply");

type Row = {
    id: string;
    date: string;
    amount: number;
    payee: string;
    account_id: string;
    account_name: string;
};

const main = async () => {
    const rows = (await sql`
        SELECT t.id, t.date, t.amount, t.payee, t.account_id, a.name AS account_name
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.transfer_id IS NULL AND t.amount <> 0
        ORDER BY t.date
    `) as Row[];

    // Group by (calendar date, absolute amount)
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
        const day = new Date(row.date).toISOString().slice(0, 10);
        const key = `${day}|${Math.abs(row.amount)}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
    }

    const pairs: { neg: Row; pos: Row }[] = [];
    const ambiguous: { key: string; rows: Row[] }[] = [];

    for (const [key, group] of groups) {
        const negs = group.filter(r => r.amount < 0);
        const poss = group.filter(r => r.amount > 0);
        if (negs.length === 0 || poss.length === 0) continue;

        // Unambiguous: exactly one candidate pairing across different accounts
        if (negs.length === 1 && poss.length === 1) {
            if (negs[0].account_id !== poss[0].account_id) {
                pairs.push({ neg: negs[0], pos: poss[0] });
            }
        } else {
            ambiguous.push({ key, rows: group });
        }
    }

    console.log(`Scanned ${rows.length} unlinked transactions.`);
    console.log(`Found ${pairs.length} unambiguous transfer pair(s):\n`);

    for (const { neg, pos } of pairs) {
        const day = new Date(neg.date).toISOString().slice(0, 10);
        const amount = (Math.abs(neg.amount) / 1000).toFixed(2);
        console.log(
            `  ${day}  ₹${amount}  ${neg.account_name} → ${pos.account_name}` +
            `  ("${neg.payee}" / "${pos.payee}")`
        );
    }

    if (ambiguous.length > 0) {
        console.log(`\nSkipped ${ambiguous.length} ambiguous group(s) (multiple same-amount candidates on one day):`);
        for (const { rows: group } of ambiguous) {
            const day = new Date(group[0].date).toISOString().slice(0, 10);
            const amount = (Math.abs(group[0].amount) / 1000).toFixed(2);
            console.log(`  ${day}  ₹${amount}  — ${group.map(r => `${r.account_name} ${r.amount > 0 ? "+" : "-"} "${r.payee}"`).join(" | ")}`);
        }
    }

    if (!APPLY) {
        console.log(`\nDry run — nothing changed. Re-run with --apply to link the ${pairs.length} pair(s).`);
        return;
    }

    let linked = 0;
    for (const { neg, pos } of pairs) {
        const transferId = createId();
        await sql`
            UPDATE transactions SET transfer_id = ${transferId}
            WHERE id IN (${neg.id}, ${pos.id})
        `;
        linked++;
    }
    console.log(`\nLinked ${linked} pair(s) (${linked * 2} transactions). Original payees/notes untouched — revert any pair by setting transfer_id back to NULL.`);
};

main();
