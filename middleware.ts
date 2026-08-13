import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/',
  "/transactions",
  "/accounts",
  "/categories",
  "/share",
  // NOTE: /share-target is deliberately NOT protected — Android share POSTs
  // arrive without SameSite-Lax cookies; /share-claim (GET) does the auth.
  "/share-claim",
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    "/((?!.+.[w]+$|_next).*)","/","/(api|trpc)(.*)"
  ],
};