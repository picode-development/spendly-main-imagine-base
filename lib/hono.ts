import { hc } from "hono/client";
import { AppType } from "@/app/api/[[...route]]/route";

// A revoked/expired Clerk session (e.g. password changed elsewhere) makes
// every API call 401 for the rest of the mounted session — middleware.ts
// only re-checks auth on navigation/fresh load, so an already-open tab was
// left showing stale/zeroed data forever instead of prompting sign-in
// again. Every API call in the app goes through this one client, so
// intercepting here catches every current and future call site — no need
// to add 401 handling to each of the ~15 individual query/mutation hooks.
// A hard redirect (not router.push) forces Clerk's middleware to re-run
// from scratch, matching exactly what already happens on a normal reopen.
const authAwareFetch: typeof fetch = async (...args) => {
    const response = await fetch(...args);
    if (
        response.status === 401 &&
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/sign-in")
    ) {
        window.location.href = "/sign-in";
    }
    return response;
};

export const client = hc<AppType>(process.env.NEXT_PUBLIC_APP_URL!, { fetch: authAwareFetch });