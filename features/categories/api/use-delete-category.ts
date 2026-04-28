import { InferResponseType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.categories[':id']["$delete"]>;

export const useDeleteCategory = ( id?: string ) => {
    const QueryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error
    >({
        mutationFn: async () => {
            const response = await client.api.categories[':id']["$delete"]({
                param: { id },
            });
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Category deleted");
            QueryClient.invalidateQueries({ queryKey: ["category", {id}] });
            QueryClient.invalidateQueries({ queryKey: ["categories"] });
            QueryClient.invalidateQueries({ queryKey: ["transactions"] });
            QueryClient.invalidateQueries({ queryKey: ["summary"] });
            // TODO: Invalidate summary and transactions.
        },
        onError: () => {
            toast.error("Failed to delete category")
        },
    });

    return mutation;
};