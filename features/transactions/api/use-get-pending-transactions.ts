import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";
import { convertAmountFromMiliunits } from "@/lib/utils";

export const useGetPendingTransactions = () => {
    const query = useQuery({
        queryKey: ["pending-transactions"],
        queryFn: async () => {
            const response = await client.api["pending-transactions"].$get();

            if (!response.ok) {
                throw new Error("Failed to fetch pending transactions");
            }

            const { data } = await response.json();
            return data.map((pending) => ({
                ...pending,
                amount: pending.amount === null
                    ? null
                    : convertAmountFromMiliunits(pending.amount),
            }));
        },
    });
    return query;
};
