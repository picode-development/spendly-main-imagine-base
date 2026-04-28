"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import qs from "query-string";
import { format, subDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

export const AllDateFilter = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const accountId = params.get("accountId");
  const categoryId = params.get("categoryId");
  const from = params.get("from");

  const APP_DEVELOPMENT_DATE = "2025-04-14";
  const isAllDates = from === format(subDays(new Date(APP_DEVELOPMENT_DATE), 1), "yyyy-MM-dd");

  const toggleAllDates = () => {
    if (isAllDates) {
      const query = {
        ...(accountId ? { accountId } : {}),
        ...(categoryId ? { categoryId } : {}),
      };

      const url = qs.stringifyUrl(
        { url: pathname, query },
        { skipNull: true, skipEmptyString: true }
      );

      router.push(url);
    } else {
      const adjustedFrom = format(subDays(new Date(APP_DEVELOPMENT_DATE), 1), "yyyy-MM-dd");
      const adjustedTo = format(addDays(new Date(), 1), "yyyy-MM-dd");

      const query = {
        accountId,
        categoryId,
        from: adjustedFrom,
        to: adjustedTo,
      };

      const url = qs.stringifyUrl(
        { url: pathname, query },
        { skipNull: true, skipEmptyString: true }
      );

      router.push(url);
    }
  };

  return (
    <Button
      size="sm"
      className={cn(
        "w-full h-9 rounded-md px-3 font-normal border-none focus:ring-offset-0 focus:ring-transparent outline-none transform transition-colors",
        isAllDates
          ? "bg-white/30 text-white font-semibold shadow-md hover:bg-white/40"
          : "bg-white/10 text-white hover:bg-white/20",
        "flex justify-between text-left",
        "lg:justify-center lg:text-center lg:w-auto"
      )}
      onClick={toggleAllDates}
    >
      All Dates
      <Calendar
        className={cn(
          "ml-3 size-4 transition-opacity",
          "text-white",
          isAllDates ? "opacity-70" : "opacity-50"
        )}
      />
    </Button>
  );
};