import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/',
  "/transactions",
  "/accounts",
  "/categories",
  "/share",
  "/share-target",
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    "/((?!.+.[w]+$|_next).*)","/","/(api|trpc)(.*)"
  ],
};