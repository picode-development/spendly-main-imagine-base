import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type PendingItem = { id: string };

export const useDeletePendingTransaction = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation<
        unknown,
        Error,
        { id: string; silent?: boolean },
        { previous: PendingItem[] | undefined }
    >({
        mutationFn: async ({ id }) => {
            const response = await client.api["pending-transactions"][":id"].$delete({
                param: { id },
            });
            if (!response.ok) {
                throw new Error("Failed to remove detected transaction");
            }
            return await response.json();
        },
        // Optimistic: the item vanishes the instant it's clicked — no
        // dead-feeling delay while the server round-trips
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["pending-transactions"] });
            const previous = queryClient.getQueryData<PendingItem[]>(["pending-transactions"]);
            queryClient.setQueryData<PendingItem[]>(
                ["pending-transactions"],
                (old) => old?.filter((item) => item.id !== id),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            // Server said no — bring it back and say so
            if (context?.previous) {
                queryClient.setQueryData(["pending-transactions"], context.previous);
            }
            toast.error("Failed to remove detected transaction");
        },
        onSuccess: (_data, variables) => {
            if (!variables.silent) {
                toast.success("Detected transaction dismissed");
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
        },
    });

    return mutation;
};
