import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import ClientLayout from "@/components/layout-client";
import ClerkWrapper from "@/components/ClerkWrapper"; // NEW: dynamic Clerk logic
import { ThemeProvider } from "next-themes"; // NEW: theme support
import { SwRegister } from "@/components/sw-register";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spendly",
  description: "A Finance Tracker To Remove Your Stress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Registered here (not inside ClientLayout) so it runs on every
            route — including /sign-in, /sign-up, and 404s — not just the
            authenticated dashboard shell. */}
        <SwRegister />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ClerkWrapper>
            <ClientLayout>{children}</ClientLayout>
          </ClerkWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
