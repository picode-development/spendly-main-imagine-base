"use client";

import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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

const SettingsPage = () => {
  const { theme = "system", setTheme } = useTheme(); // Default to system

  const enabled = useAppLockStore((s) => s.enabled);
  const isSupported = useAppLockStore((s) => s.isSupported);
  const enable = useAppLockStore((s) => s.enable);
  const disable = useAppLockStore((s) => s.disable);

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

  return (
    <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
      <Card className="border-none drop-shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative flex items-center justify-between py-2 px-1">
            {/* Left-side label */}
            <Label htmlFor="theme-select" className="text-md font-medium">
              Theme
            </Label>

            {/* Right-side dropdown */}
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

          <div className="relative flex items-center justify-between py-2 px-1">
            {/* Left-side label + description */}
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

            {/* Right-side toggle */}
            <AppLockSwitch
              id="app-lock"
              checked={enabled}
              disabled={!isSupported}
              onCheckedChange={handleToggleLock}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
