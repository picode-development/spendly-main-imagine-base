"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import qs from "query-string";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

// Toggles a clean `range=all` param. The data hooks translate it into
// `allDates=true` API calls with no date bounds — no fabricated dates.
export const AllDateFilter = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const accountId = params.get("accountId");
  const categoryId = params.get("categoryId");
  const from = params.get("from");
  const to = params.get("to");

  const isAllTime = params.get("range") === "all";

  const toggleAllTime = () => {
    const query = isAllTime
      ? {
          // back to the default period, keeping the other filters
          ...(accountId ? { accountId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }
      : {
          // all time: drop the dates entirely
          ...(accountId ? { accountId } : {}),
          ...(categoryId ? { categoryId } : {}),
          range: "all",
        };

    const url = qs.stringifyUrl(
      { url: pathname, query },
      { skipNull: true, skipEmptyString: true }
    );

    router.push(url);
  };

  return (
    <Button
      size="sm"
      className={cn(
        "w-full h-9 rounded-md px-3 font-normal border-none focus:ring-offset-0 focus:ring-transparent outline-none transform transition-colors",
        isAllTime
          ? "bg-white/30 text-white font-semibold shadow-md hover:bg-white/40"
          : "bg-white/10 text-white hover:bg-white/20",
        "flex justify-between text-left",
        "lg:justify-center lg:text-center lg:w-auto"
      )}
      onClick={toggleAllTime}
    >
      All time
      <Calendar
        className={cn(
          "ml-3 size-4 transition-opacity",
          "text-white",
          isAllTime ? "opacity-70" : "opacity-50"
        )}
      />
    </Button>
  );
};
