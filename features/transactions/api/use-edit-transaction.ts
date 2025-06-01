import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.transactions[':id']["$patch"]>;
type RequestType = InferRequestType<typeof client.api.transactions[':id']["$patch"]>["json"];

export const useEditTransaction = ( id?: string ) => {
    const QueryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error,
        RequestType 
    >({
        mutationFn: async (json) => {
            const response = await client.api.transactions[':id']["$patch"]({
                param: { id },
                json,
            });
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Transaction updated");
            QueryClient.invalidateQueries({ queryKey: ["transaction", {id}] });
            QueryClient.invalidateQueries({ queryKey: ["transactions"] });
            QueryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: () => {
            toast.error("Failed to edit transaction")
        },
    });

    return mutation;
};