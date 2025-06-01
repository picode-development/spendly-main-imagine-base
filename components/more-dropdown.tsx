"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "./ui/more-select";
import {
  Menu,
  Wallet,
  Tags,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const MoreDropdown = () => {
  const router = useRouter();
  const pathname = usePathname();

  const handleNavigate = (value: string) => {
    router.push(value);
  };

  const isActive =
    pathname.startsWith("/accounts") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/settings");

  const textClass = isActive ? "text-black font-semibold" : "text-gray-500";

  return (
    <div className={`flex flex-col items-center text-xs gap-1 ${textClass}`}>
      <Select onValueChange={handleNavigate}>
        <SelectTrigger
          className={cn(
            "p-0 w-auto h-auto border-none shadow-none",
            "bg-transparent dark:bg-transparent",
            "hover:bg-transparent dark:hover:bg-transparent",
            "focus:ring-0 focus:outline-none",
            "text-gray-500 dark:text-gray-400",
            isActive && "text-black dark:text-white font-semibold"
          )}
        >
          <Menu className="size-6" />
        </SelectTrigger>
        <SelectContent side="top" sideOffset={8} align="center" className="z-50">
          <SelectItem value="/accounts">
            <Wallet className="mr-2 size-4" />
            Accounts
          </SelectItem>
          <SelectItem value="/categories">
            <Tags className="mr-2 size-4" />
            Categories
          </SelectItem>
          <SelectItem value="/settings">
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </SelectItem>
        </SelectContent>
      </Select>
      <span
        className={cn(
          "transition-colors",
          isActive
            ? "text-black dark:text-white font-semibold"
            : "text-gray-500 dark:text-gray-400"
        )}
      >
        Others
      </span>
    </div>
  );
};
