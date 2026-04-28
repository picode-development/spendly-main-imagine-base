import { InferResponseType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.transactions[':id']["$delete"]>;

export const useDeleteTransaction = ( id?: string ) => {
    const QueryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error
    >({
        mutationFn: async () => {
            const response = await client.api.transactions[':id']["$delete"]({
                param: { id },
            });
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Transaction deleted");
            QueryClient.invalidateQueries({ queryKey: ["transaction", {id}] });
            QueryClient.invalidateQueries({ queryKey: ["transactions"] });
            QueryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: () => {
            toast.error("Failed to delete transaction")
        },
    });

    return mutation;
};