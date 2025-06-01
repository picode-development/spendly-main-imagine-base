"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { dark } from "@clerk/themes";
import { useEffect, useState } from "react";

export default function ClerkWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const sharedLayout = {
    layout: {
      unsafe_disableDevelopmentModeWarnings: true,
    },
  };

  const customDarkAppearance = {
    baseTheme: dark,
    variables: {
      colorPrimary: '#3B82F6', // Tailwind blue-500
      colorText: '#E0F2FE',    // blue-100
      colorBackground: '#0F172A', // slate-900
      colorInputBackground: '#1E293B', // slate-800
      colorInputText: '#E0F2FE',
      colorButtonText: '#FFFFFF',
      colorButtonBackground: '#2563EB', // blue-600
      colorButtonHoverBackground: '#1D4ED8', // blue-700
    },
    ...sharedLayout,
  };

  const appearance = resolvedTheme === "dark"
    ? customDarkAppearance
    : sharedLayout;

  return <ClerkProvider appearance={appearance}>{children}</ClerkProvider>;
}
