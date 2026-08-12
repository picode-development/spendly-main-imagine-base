import { InferRequestType } from "hono";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/hono";

export const useGetSmsRules = () => {
    return useQuery({
        queryKey: ["sms-rules"],
        queryFn: async () => {
            const response = await client.api["sms-rules"].$get();
            if (!response.ok) throw new Error("Failed to fetch SMS formats");
            const { data } = await response.json();
            return data;
        },
    });
};

type CreateRequest = InferRequestType<typeof client.api["sms-rules"]["$post"]>["json"];

export const useCreateSmsRule = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, CreateRequest>({
        mutationFn: async (json) => {
            const response = await client.api["sms-rules"].$post({ json });
            if (!response.ok) throw new Error("Failed to save SMS format");
            return await response.json();
        },
        onSuccess: () => {
            toast.success("SMS format saved");
            queryClient.invalidateQueries({ queryKey: ["sms-rules"] });
        },
        onError: () => {
            toast.error("Failed to save SMS format");
        },
    });
};

export const useDeleteSmsRule = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { id: string }>({
        mutationFn: async ({ id }) => {
            const response = await client.api["sms-rules"][":id"].$delete({ param: { id } });
            if (!response.ok) throw new Error("Failed to delete SMS format");
            return await response.json();
        },
        onSuccess: () => {
            toast.success("SMS format removed");
            queryClient.invalidateQueries({ queryKey: ["sms-rules"] });
        },
        onError: () => {
            toast.error("Failed to delete SMS format");
        },
    });
};
