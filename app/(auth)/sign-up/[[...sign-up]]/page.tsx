'use client';

import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { SignUp, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left Side */}
      <div className="h-full lg:flex flex-col items-center justify-center px-4 bg-white dark:bg-background">
        <div className="text-center space-y-4 pt-16">
          <h1 className="font-bold text-3xl text-[#2E2A47] dark:text-white">
            Join Spendly
          </h1>
          <p className="text-base text-[#7E8CA0] dark:text-slate-400">
            Create your account and start tracking your finances stress-free!
          </p>
        </div>
        <div className="flex items-center justify-center mt-8">
          <ClerkLoaded>
            <SignUp path="/sign-up" />
          </ClerkLoaded>
          <ClerkLoading>
            <Loader2 className="animate-spin text-muted-foreground" />
          </ClerkLoading>
        </div>
      </div>

      {/* Right Side */}
      <div className="h-full bg-blue-600 dark:bg-[linear-gradient(to_bottom,var(--header-gradient-from),var(--header-gradient-to))] hidden lg:flex items-center justify-center">
        <Image src="/White-Larger-Logo.svg" height={200} width={200} alt="logo" />
      </div>
    </div>
  );
}
