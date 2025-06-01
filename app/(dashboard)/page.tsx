'use client';

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";

export default function DashboardPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // This prevents hydration mismatch on first render
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
      <DataGrid />
      <DataCharts />
    </div>
  );
}
