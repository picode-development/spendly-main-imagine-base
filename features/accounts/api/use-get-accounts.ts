import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";

client.api.accounts.$get

// Exported so components/prefetch-common-data.tsx can prefetch under the
// exact same queryKey/queryFn — otherwise a prefetch call with a slightly
// different fetcher would populate a cache entry this hook never reads.
export const getAccountsQueryFn = async () => {
    const response = await client.api.accounts.$get();

    if (!response.ok) {
        throw new Error("Failed to fetch accounts")
    }

    const {data} = await response.json();
    return data;
};

export const useGetAccounts = () => {
    const query = useQuery({
        queryKey: ["accounts"],
        queryFn: getAccountsQueryFn,
    });
    return query;
};