import webpush from "web-push";
import { db } from "@/db/drizzle";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

let configured = false;
function ensureConfigured() {
    if (configured) return true;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
}

/**
 * Pushes to every subscription a user has (phone + desktop, etc). Fire this
 * with `await` at call sites — Vercel functions can terminate before an
 * un-awaited promise settles, so there's no "fire and forget" here. Expired
 * subscriptions (410/404) are pruned as they're discovered.
 */
export async function sendPushToUser(
    userId: string,
    payload: { title: string; body: string; url?: string },
): Promise<void> {
    if (!ensureConfigured()) return; // VAPID not set up yet — no-op, not an error

    const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

    if (subs.length === 0) return;

    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    JSON.stringify(payload),
                );
            } catch (err) {
                const statusCode = (err as { statusCode?: number })?.statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
                }
            }
        }),
    );
}
