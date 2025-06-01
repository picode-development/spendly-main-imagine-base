import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

type ResponseType = InferResponseType<typeof client.api.accounts["bulk-delete"]["$post"]>;
type RequestType = InferRequestType<typeof client.api.accounts["bulk-delete"]["$post"]>["json"];

export const useBulkDeleteAccounts = () => {
    const QueryClient = useQueryClient();
    const mutation = useMutation<
        ResponseType,
        Error,
        RequestType 
    >({
        mutationFn: async (json) => {
            const response = await client.api.accounts["bulk-delete"]["$post"]({json});
            return await response.json();
        },
        onSuccess: () => {
            toast.success("Accounts Deleted");
            QueryClient.invalidateQueries({ queryKey: ["accounts"] });
            // TODO: ALso invalidate summary
        },
        onError: () => {
            toast.error("Failed to delete accounts")
        },
    });

    return mutation;
};