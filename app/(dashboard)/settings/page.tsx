"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { BellRing, Check, Copy, Download, Loader2, MonitorSmartphone, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AppLockSwitch } from "@/components/ui/app-lock-switch";
import { useAppLockStore } from "@/hooks/use-app-lock";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useGetPendingTransactions } from "@/features/transactions/api/use-get-pending-transactions";
import { client } from "@/lib/hono";
import { convertAmountFromMiliunits } from "@/lib/utils";

// Quotes the value and defuses spreadsheet formula injection (=, +, -, @
// prefixes execute in Excel/Sheets — SMS-derived payees are untrusted)
const csvEscape = (value: string) => {
    const defused = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${defused.replace(/"/g, '""')}"`;
};

// XXXX-XXXX-XXXX — codes are stored undashed
const formatPairingCode = (token: string) =>
    token.replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");

const SettingsPage = () => {
  const router = useRouter();
  const { theme = "system", setTheme } = useTheme(); // Default to system

  const enabled = useAppLockStore((s) => s.enabled);
  const isSupported = useAppLockStore((s) => s.isSupported);
  const enable = useAppLockStore((s) => s.enable);
  const disable = useAppLockStore((s) => s.disable);

  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const { data: pending } = useGetPendingTransactions();

  const [isExporting, setIsExporting] = useState(false);

  const queryClient = useQueryClient();
  const widgetTokenQuery = useQuery({
    queryKey: ["widget-token"],
    queryFn: async () => {
      const response = await client.api.widget.token.$get();
      if (!response.ok) throw new Error("Failed to fetch widget token");
      const { data } = await response.json();
      return data;
    },
  });
  const generateToken = useMutation({
    mutationFn: async () => {
      const response = await client.api.widget.token.$post();
      if (!response.ok) throw new Error("Failed to generate pairing code");
      const { data } = await response.json();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-token"] });
      toast.success("Pairing code ready — enter it in the Spendly Widgets app");
    },
    onError: () => toast.error("Couldn't generate a pairing code"),
  });
  const revokeToken = useMutation({
    mutationFn: async () => {
      const response = await client.api.widget.token.$delete();
      if (!response.ok) throw new Error("Failed to revoke pairing code");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-token"] });
      toast.success("Pairing code revoked — widgets will stop updating");
    },
    onError: () => toast.error("Couldn't revoke the pairing code"),
  });
  const widgetToken = widgetTokenQuery.data;

  const handleCopyCode = async () => {
    if (!widgetToken) return;
    await navigator.clipboard.writeText(formatPairingCode(widgetToken.token));
    toast.success("Pairing code copied");
  };

  const handleToggleLock = async (next: boolean) => {
    if (next) {
      try {
        await enable(); // triggers the fingerprint / device-passcode enrollment prompt
        toast.success("App Lock enabled");
      } catch {
        toast.error("Couldn't enable App Lock");
      }
    } else {
      disable();
      toast.success("App Lock disabled");
    }
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("Spendly installed");
    if (outcome === "unavailable") {
      toast.info("Use your browser menu → Install app / Add to Home Screen");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await client.api.transactions.$get({
        query: { from: "", to: "", accountId: "", allDates: "true" },
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      const { data } = await response.json();

      const header = ["Date", "Payee", "Amount", "Category", "Account", "Notes"];
      const rows = data.map((t) => [
        format(new Date(t.date), "yyyy-MM-dd"),
        csvEscape(t.payee ?? ""),
        String(convertAmountFromMiliunits(t.amount)),
        csvEscape(t.category ?? (t.transferId ? "Transfer" : "")),
        csvEscape(t.account ?? ""),
        csvEscape(t.notes ?? ""),
      ]);
      const csv = "﻿" + [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spendly-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.length} transactions`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
      <Card className="border-none drop-shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Appearance
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <Label htmlFor="theme-select" className="text-md font-medium">
              Theme
            </Label>
            <div className="relative">
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value)}
              >
                <SelectTrigger id="theme-select" className="w-[160px]">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-2" />

          <p className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Security
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label htmlFor="app-lock" className="text-md font-medium">
                App Lock
              </Label>
              <span className="text-sm text-muted-foreground">
                {isSupported
                  ? "Require fingerprint, face unlock, or your screen lock to open Spendly."
                  : "Not available on this device or browser."}
              </span>
            </div>
            <AppLockSwitch
              id="app-lock"
              checked={enabled}
              disabled={!isSupported}
              onCheckedChange={handleToggleLock}
            />
          </div>

          <Separator className="my-2" />

          <p className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            App
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Install Spendly
              </Label>
              <span className="text-sm text-muted-foreground">
                {isInstalled
                  ? "Installed on this device — sharing bank SMS to Spendly works from any app."
                  : canInstall
                    ? "Add Spendly to your home screen and share bank SMS straight into it."
                    : "Open Spendly in Chrome and use the browser menu → Install app."}
              </span>
            </div>
            {isInstalled ? (
              <Badge variant="secondary" className="shrink-0">
                <Check className="size-3 mr-1" />
                Installed
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={!canInstall}
                className="shrink-0"
              >
                <MonitorSmartphone className="size-4 mr-2" />
                Install
              </Button>
            )}
          </div>

          <Separator className="my-2" />

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Detected transactions
              </Label>
              <span className="text-sm text-muted-foreground">
                Bank SMS shared or forwarded to Spendly wait here until you review them.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/transactions")}
              disabled={!pending || pending.length === 0}
              className="shrink-0"
            >
              <BellRing className="size-4 mr-2" />
              {pending && pending.length > 0
                ? `Review ${pending.length}`
                : "None waiting"}
            </Button>
          </div>

          <Separator className="my-2" />

          <p className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Widgets
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Spendly Widgets app
              </Label>
              <span className="text-sm text-muted-foreground">
                Home-screen widgets for Android and iOS. Download the app, then
                pair it with the code below.
              </span>
            </div>
            <Button size="sm" className="shrink-0" asChild>
              <a href="/spendly-widgets.apk" download>
                <Smartphone className="size-4 mr-2" />
                Android APK
              </a>
            </Button>
          </div>

          <Separator className="my-2" />

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Widget pairing code
              </Label>
              <span className="text-sm text-muted-foreground">
                {widgetToken
                  ? "Enter this code in the Spendly Widgets app. Regenerating unpairs existing devices."
                  : "Generate a code to connect the Spendly Widgets app to your account."}
              </span>
              {widgetToken && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="mt-2 inline-flex w-fit items-center gap-2 rounded-md border bg-muted px-3 py-1.5 font-mono text-sm tracking-widest hover:bg-muted/70"
                  title="Copy pairing code"
                >
                  {formatPairingCode(widgetToken.token)}
                  <Copy className="size-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateToken.mutate()}
                disabled={generateToken.isPending || widgetTokenQuery.isLoading}
              >
                {generateToken.isPending
                  ? <Loader2 className="size-4 mr-2 animate-spin" />
                  : <RefreshCw className="size-4 mr-2" />}
                {widgetToken ? "Regenerate" : "Generate"}
              </Button>
              {widgetToken && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revokeToken.mutate()}
                  disabled={revokeToken.isPending}
                  title="Revoke pairing code"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          <Separator className="my-2" />

          <p className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Data
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Export transactions
              </Label>
              <span className="text-sm text-muted-foreground">
                Download your complete transaction history as a CSV file.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              className="shrink-0"
            >
              {isExporting
                ? <Loader2 className="size-4 mr-2 animate-spin" />
                : <Download className="size-4 mr-2" />}
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
