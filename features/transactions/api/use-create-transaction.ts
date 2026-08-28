import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";
import { enqueueMutation } from "@/lib/offline-outbox";

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
            // Skip straight to the outbox when offline; no point waiting on
            // a fetch that can't possibly succeed.
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                await enqueueMutation({
                    method: "POST",
                    url: "/api/transactions",
                    body: json,
                    label: json.payee ? `Transaction: ${json.payee}` : "New transaction",
                });
                return { data: null } as unknown as ResponseType;
            }
            try {
                const response = await client.api.transactions.$post({json});
                return await response.json();
            } catch (err) {
                if (err instanceof TypeError) {
                    // Network dropped mid-request — queue instead of failing outright
                    await enqueueMutation({
                        method: "POST",
                        url: "/api/transactions",
                        body: json,
                        label: json.payee ? `Transaction: ${json.payee}` : "New transaction",
                    });
                    return { data: null } as unknown as ResponseType;
                }
                throw err;
            }
        },
        onSuccess: (result) => {
            if ((result as { data: unknown }).data === null) {
                toast.success("Saved offline — will sync when you're back online");
            } else {
                toast.success("Transaction Created");
            }
            QueryClient.invalidateQueries({ queryKey: ["transactions"] });
            QueryClient.invalidateQueries({ queryKey: ["summary"] });
        },
        onError: () => {
            toast.error("Failed to create transaction")
        },
    });

    return mutation;
};
