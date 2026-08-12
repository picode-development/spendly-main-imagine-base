import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

export const useCreatePendingTransaction = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation<unknown, Error, { message: string }>({
        mutationFn: async (json) => {
            const response = await client.api["pending-transactions"].$post({ json });
            if (!response.ok) {
                throw new Error("Failed to save shared message");
            }
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Transaction detected — review it below");
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
        },
        onError: () => {
            toast.error("Couldn't read a transaction from that message");
        },
    });

    return mutation;
};
