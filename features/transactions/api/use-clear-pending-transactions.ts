import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

export const useClearPendingTransactions = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, void, { previous: unknown }>({
        mutationFn: async () => {
            const response = await client.api["pending-transactions"]["clear-all"].$post();
            if (!response.ok) throw new Error("Failed to clear detected transactions");
            return await response.json();
        },
        // Optimistic: the popup empties instantly
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ["pending-transactions"] });
            const previous = queryClient.getQueryData(["pending-transactions"]);
            queryClient.setQueryData(["pending-transactions"], []);
            return { previous };
        },
        onError: (_e, _v, context) => {
            if (context?.previous !== undefined) {
                queryClient.setQueryData(["pending-transactions"], context.previous);
            }
            toast.error("Failed to clear detected transactions");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
        },
    });
};
