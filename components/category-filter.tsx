"use client";

import qs from "query-string";
import {
  usePathname,
  useRouter,
  useSearchParams
} from "next/navigation";

import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useGetSummary } from "@/features/summary/api/use-get-summary";

import {
  SelectAccount,
  SelectContentAcc,
  SelectItemAcc,
  SelectTriggerAcc,
  SelectValueAcc
} from "./ui/select-for-account-colour-issue";

export const CategoryFilter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const { isLoading: isLoadingSummary } = useGetSummary();

  const params = useSearchParams();
  const accountId = params.get("accountId") || "";
  const categoryId = params.get("categoryId") || "all";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const range = params.get("range") || "";

  const {
    data: categories,
    isLoading: isLoadingCategories,
  } = useGetCategories();

  const onChange = (newValue: string) => {
    const query = {
      accountId,
      categoryId: newValue === "all" ? "" : newValue,
      from,
      to,
      range,
    };

    const url = qs.stringifyUrl({
      url: pathname,
      query,
    }, { skipNull: true, skipEmptyString: true });

    router.push(url);
  };

  return (
    <SelectAccount
      value={categoryId}
      onValueChange={onChange}
      disabled={isLoadingCategories || isLoadingSummary}
    >
      <SelectTriggerAcc
        className="lg:w-auto w-full h-9 rounded-md px-3 font-normal bg-white/10 hover:bg-white/20 hover:text-white border-none focus:ring-offset-0 focus:ring-transparent outline-none text-white placeholder:text-white transition flex justify-between items-center"
      >
        <SelectValueAcc placeholder="Select category" className="text-white placeholder:text-white" />
      </SelectTriggerAcc>

      <SelectContentAcc>
        <SelectItemAcc value="all">All categories</SelectItemAcc>
        {categories?.map((category) => (
          <SelectItemAcc key={category.id} value={category.id}>
            {category.name}
          </SelectItemAcc>
        ))}
      </SelectContentAcc>
    </SelectAccount>
  );
};