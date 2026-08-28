"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccountsQueryFn } from "@/features/accounts/api/use-get-accounts";
import { getCategoriesQueryFn } from "@/features/categories/api/use-get-categories";

/**
 * Accounts/categories are needed on almost every dashboard page and rarely
 * change — warm the React Query cache for them as soon as the dashboard
 * shell mounts, so whichever page the user lands on next already has the
 * data instead of starting its fetch from a cold mount. Reuses the exact
 * queryKey/queryFn each page's own hook uses, so this populates the same
 * cache entry rather than a duplicate one.
 */
export const PrefetchCommonData = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        queryClient.prefetchQuery({ queryKey: ["accounts"], queryFn: getAccountsQueryFn });
        queryClient.prefetchQuery({ queryKey: ["categories"], queryFn: getCategoriesQueryFn });
    }, [queryClient]);

    return null;
};
