import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

export const useDeletePendingTransaction = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation<unknown, Error, { id: string; silent?: boolean }>({
        mutationFn: async ({ id }) => {
            const response = await client.api["pending-transactions"][":id"].$delete({
                param: { id },
            });
            if (!response.ok) {
                throw new Error("Failed to remove detected transaction");
            }
            return await response.json();
        },
        onSuccess: (_data, variables) => {
            if (!variables.silent) {
                toast.success("Detected transaction dismissed");
            }
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
        },
        onError: () => {
            toast.error("Failed to remove detected transaction");
        },
    });

    return mutation;
};
