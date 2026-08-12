import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";
import { useSearchParams } from "next/navigation";
import { transactions } from "@/db/schema";
import { convertAmountFromMiliunits } from "@/lib/utils";

client.api.accounts.$get

export const useGetTransactions = () => {
    const params = useSearchParams();
    const isAllTime = params.get("range") === "all";
    const from = isAllTime ? "" : params.get("from") || "";
    const to = isAllTime ? "" : params.get("to") || "";
    const accountId = params.get("accountId") || "";

    const query = useQuery({
        // TODO: Check if the params is needed in the key.
        queryKey: ["transactions", { from, to, accountId, isAllTime }],
        queryFn: async () => {
            const response = await client.api.transactions.$get({
                query: {
                    from,
                    to,
                    accountId,
                    ...(isAllTime ? { allDates: "true" as const } : {}),
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch transactions")
            }

            const {data} = await response.json();
            return data.map((transaction) => ({
                ...transaction,
                amount: convertAmountFromMiliunits(transaction.amount),
            }));
        },
    });
    return query;
};