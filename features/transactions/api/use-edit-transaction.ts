import { InferResponseType, InferRequestType } from "hono";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";
import { enqueueMutation } from "@/lib/offline-outbox";

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
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                await enqueueMutation({
                    method: "PATCH",
                    url: `/api/transactions/${id}`,
                    body: json,
                    label: json.payee ? `Edit: ${json.payee}` : "Edited transaction",
                });
                return { data: null } as unknown as ResponseType;
            }
            try {
                const response = await client.api.transactions[':id']["$patch"]({
                    param: { id },
                    json,
                });
                return await response.json();
            } catch (err) {
                if (err instanceof TypeError) {
                    await enqueueMutation({
                        method: "PATCH",
                        url: `/api/transactions/${id}`,
                        body: json,
                        label: json.payee ? `Edit: ${json.payee}` : "Edited transaction",
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
                toast.success("Transaction updated");
            }
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
