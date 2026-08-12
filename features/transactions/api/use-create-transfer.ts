import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.transactions.transfer.$post>;
type RequestType = InferRequestType<typeof client.api.transactions.transfer.$post>["json"];

export const useCreateTransfer = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error,
        RequestType
    >({
        mutationFn: async (json) => {
            const response = await client.api.transactions.transfer.$post({ json });
            if (!response.ok) {
                throw new Error("Failed to transfer funds");
            }
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Funds transferred");
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: () => {
            toast.error("Failed to transfer funds");
        },
    });

    return mutation;
};
