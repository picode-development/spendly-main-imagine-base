"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/providers/query.provider";
import { SheetProvider } from "@/providers/sheet-provider";
import { Toaster } from "@/components/ui/sonner";
import { FullPageLoader } from "./FullPageLoader";
import Assistant from "./assistant";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthPage) {
      const timer = setTimeout(() => setIsLoading(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthPage]);

  const content = isLoading ? (
    <FullPageLoader />
  ) : (
    <QueryProvider>
      <SheetProvider />
      <Toaster />
      {children}
      {!isAuthPage && <Assistant />} {/* Only show trigger on non-auth pages */}
    </QueryProvider>
  );

  if (isAuthPage) {
    return (
      <QueryProvider>
        <SheetProvider />
        <Toaster />
        {children}
      </QueryProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {content}
    </ThemeProvider>
  );
}
