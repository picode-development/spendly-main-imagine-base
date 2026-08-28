"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { BellRing, Check, Copy, Download, HardDrive, Loader2, MonitorSmartphone, RefreshCw, Smartphone, Trash2 } from "lucide-react";
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
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { useGetPendingTransactions } from "@/features/transactions/api/use-get-pending-transactions";
import { client } from "@/lib/hono";
import { convertAmountFromMiliunits } from "@/lib/utils";
import { peekOutbox, requestOutboxDrain, type OutboxItem } from "@/lib/offline-outbox";

// Quotes the value and defuses spreadsheet formula injection (=, +, -, @
// prefixes execute in Excel/Sheets — SMS-derived payees are untrusted)
const csvEscape = (value: string) => {
    const defused = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${defused.replace(/"/g, '""')}"`;
};

// XXXX-XXXX-XXXX — codes are stored undashed
const formatPairingCode = (token: string) =>
    token.replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");

// Which Spendly Widgets installer fits this device. iPadOS 13+ reports a
// Mac user agent, so multi-touch Macs count as iOS.
const detectPlatform = (): "android" | "ios" | "other" => {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
    return "other";
};

const SettingsPage = () => {
  const router = useRouter();
  const { theme = "system", setTheme } = useTheme(); // Default to system

  const enabled = useAppLockStore((s) => s.enabled);
  const isSupported = useAppLockStore((s) => s.isSupported);
  const enable = useAppLockStore((s) => s.enable);
  const disable = useAppLockStore((s) => s.disable);

  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const { data: pending } = useGetPendingTransactions();
  const {
    supported: pushSupported,
    permission: pushPermission,
    isSubscribed,
    isLoading: pushLoading,
    subscribe,
    unsubscribe,
  } = usePushSubscription();

  const [isExporting, setIsExporting] = useState(false);
  const [platform] = useState(detectPlatform);
  const [cacheInfo, setCacheInfo] = useState<{ staticCount: number; apiCount: number } | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshOutbox = () => {
    peekOutbox().then(setOutboxItems).catch(() => {});
  };

  useEffect(() => {
    refreshOutbox();
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "OUTBOX_DRAINED") {
        setIsSyncing(false);
        refreshOutbox();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

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

  const handleToggleNotifications = async (next: boolean) => {
    if (next) {
      const ok = await subscribe();
      if (ok) toast.success("Notifications enabled");
      else if (pushPermission === "denied") toast.error("Notifications are blocked for Spendly in your browser settings");
      else toast.error("Couldn't enable notifications");
    } else {
      await unsubscribe();
      toast.success("Notifications disabled");
    }
  };

  const handleGetCacheInfo = () => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      setCacheInfo({ staticCount: event.data.staticCount, apiCount: event.data.apiCount });
    };
    navigator.serviceWorker.controller.postMessage({ type: "GET_CACHE_INFO" }, [channel.port2]);
  };

  useEffect(() => {
    handleGetCacheInfo();
    // Runs once on mount — cheap, read-only status probe
  }, []);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
      queryClient.invalidateQueries();
      toast.success("Cache cleared");
      setTimeout(handleGetCacheInfo, 300);
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleRetrySync = () => {
    setIsSyncing(true);
    requestOutboxDrain();
    setTimeout(() => setIsSyncing(false), 5000); // give up spinning if nothing came back
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
                Download native app
              </Label>
              <span className="text-sm text-muted-foreground">
                {platform === "ios"
                  ? "Not available for iOS — use \"Install Spendly\" above instead."
                  : "A packaged version of this same site for Android or Windows, built with PWABuilder."}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
              {(platform === "android" || platform === "other") && (
                <Button size="sm" className="shrink-0" asChild>
                  <a href="/spendly-android.apk" download>
                    <Smartphone className="size-4 mr-2" />
                    Android APK
                  </a>
                </Button>
              )}
              {platform === "other" && (
                <Button size="sm" variant="outline" className="shrink-0" asChild>
                  <a href="/spendly-windows.zip" download>
                    <MonitorSmartphone className="size-4 mr-2" />
                    Windows
                  </a>
                </Button>
              )}
            </div>
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
            Offline &amp; Notifications
          </p>

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label htmlFor="push-notifications" className="text-md font-medium">
                New transaction alerts
              </Label>
              <span className="text-sm text-muted-foreground">
                {!pushSupported
                  ? isInstalled
                    ? "Not supported in this browser."
                    : "Install Spendly to enable notifications."
                  : "Get notified when Spendly detects a new transaction from SMS or a shared screenshot."}
              </span>
            </div>
            {pushLoading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <AppLockSwitch
                id="push-notifications"
                checked={isSubscribed}
                disabled={!pushSupported}
                onCheckedChange={handleToggleNotifications}
              />
            )}
          </div>

          <Separator className="my-2" />

          <div className="relative flex items-center justify-between py-2 px-1">
            <div className="flex flex-col pr-4">
              <Label className="text-md font-medium">
                Offline data
              </Label>
              <span className="text-sm text-muted-foreground">
                {cacheInfo
                  ? `${cacheInfo.apiCount} pages of data and ${cacheInfo.staticCount} files saved for offline use.`
                  : "Spendly saves recent data so the app still works with no signal."}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="shrink-0"
            >
              {isClearingCache
                ? <Loader2 className="size-4 mr-2 animate-spin" />
                : <HardDrive className="size-4 mr-2" />}
              Clear cache
            </Button>
          </div>

          {outboxItems.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="relative flex items-center justify-between py-2 px-1">
                <div className="flex flex-col pr-4">
                  <Label className="text-md font-medium">
                    Pending offline changes
                  </Label>
                  <span className="text-sm text-muted-foreground">
                    {outboxItems.length === 1
                      ? "1 change made offline hasn't synced yet."
                      : `${outboxItems.length} changes made offline haven't synced yet.`}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetrySync}
                  disabled={isSyncing}
                  className="shrink-0"
                >
                  {isSyncing
                    ? <Loader2 className="size-4 mr-2 animate-spin" />
                    : <RefreshCw className="size-4 mr-2" />}
                  Retry sync
                </Button>
              </div>
            </>
          )}

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
                {platform === "android"
                  ? "Home-screen widgets for this phone. Download the APK, allow the install, then pair with the code below."
                  : platform === "ios"
                    ? "Home-screen widgets for iPhone/iPad. The iOS build is coming soon — Android is available today."
                    : "Home-screen widgets for your phone. Open this page on the phone, or grab the installer here."}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
              {(platform === "android" || platform === "other") && (
                <Button size="sm" className="shrink-0" asChild>
                  <a href="/spendly-widgets.apk" download>
                    <Smartphone className="size-4 mr-2" />
                    Android APK
                  </a>
                </Button>
              )}
              {(platform === "ios" || platform === "other") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled
                  title="The iOS build isn't available yet"
                >
                  <Smartphone className="size-4 mr-2" />
                  iOS — coming soon
                </Button>
              )}
            </div>
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
