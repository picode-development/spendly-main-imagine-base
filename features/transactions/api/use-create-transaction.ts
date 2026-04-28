import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.transactions.$post>;
type RequestType = InferRequestType<typeof client.api.transactions.$post>["json"];

export const useCreateTransaction = () => {
    const QueryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error,
        RequestType 
    >({
        mutationFn: async (json) => {
            const response = await client.api.transactions.$post({json});
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Transaction Created");
            QueryClient.invalidateQueries({ queryKey: ["transactions"] });
            QueryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: () => {
            toast.error("Failed to create transaction")
        },
    });

    return mutation;
};