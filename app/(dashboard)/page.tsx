'use client';

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

export default function DashboardPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { onOpen } = useNewTransaction();

  // This prevents hydration mismatch on first render
  useEffect(() => {
    setMounted(true);
  }, []);

  // Manifest "Add Transaction" shortcut lands here with ?new=true
  useEffect(() => {
    if (searchParams.get("new") !== "true") return;
    onOpen();
    router.replace("/");
  }, [searchParams, onOpen, router]);

  if (!mounted) return null;

  return (
    <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
      <DataGrid />
      <DataCharts />
    </div>
  );
}
