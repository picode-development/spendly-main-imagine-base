import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";
import { useSearchParams } from "next/navigation";
import { convertAmountFromMiliunits, getDefaultDateRange } from "@/lib/utils";
import { format } from "date-fns";

export const useGetSummary = () => {
    const params = useSearchParams();
    const from = params.get("from") || undefined;
    const to = params.get("to") || undefined;
    const accountId = params.get("accountId") || undefined;

    const query = useQuery({
        queryKey: ["summary", { from, to, accountId }],
        queryFn: async () => {
            // Build query object
            const queryParams: Record<string, string> = {};
            
            // If no date params in URL, use default dates for API call
            if (!from || !to) {
                const { defaultFrom, defaultTo } = getDefaultDateRange();
                queryParams.from = format(defaultFrom, "yyyy-MM-dd");
                queryParams.to = format(defaultTo, "yyyy-MM-dd");
            } else {
                // Use the adjusted dates from URL params
                queryParams.from = from;
                queryParams.to = to;
            }
            
            if (accountId) queryParams.accountId = accountId;

            const response = await client.api.summary.$get({
                query: queryParams,
            });

            if (!response.ok) {
                throw new Error("Failed to fetch summary")
            }

            const {data} = await response.json();
            return {
                ...data,
                incomeAmount: convertAmountFromMiliunits(data.incomeAmount),
                expensesAmount: convertAmountFromMiliunits(data.expensesAmount),
                remainingAmount: convertAmountFromMiliunits(data.remainingAmount),
                categories: data.categories.map((category) => ({
                    ...category,
                    value: convertAmountFromMiliunits(category.value),
                })),

                days: data.days.map((day) => ({
                    ...day,
                    income: convertAmountFromMiliunits(day.income),
                    expenses: convertAmountFromMiliunits(day.expenses),
                }))
            }
        },
    });
    return query;
};
