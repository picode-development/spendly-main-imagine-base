import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono";

client.api.categories.$get

// Exported so components/prefetch-common-data.tsx can prefetch under the
// exact same queryKey/queryFn — otherwise a prefetch call with a slightly
// different fetcher would populate a cache entry this hook never reads.
export const getCategoriesQueryFn = async () => {
    const response = await client.api.categories.$get();

    if (!response.ok) {
        throw new Error("Failed to fetch categories")
    }

    const {data} = await response.json();
    return data;
};

export const useGetCategories = () => {
    const query = useQuery({
        queryKey: ["categories"],
        queryFn: getCategoriesQueryFn,
    });
    return query;
};