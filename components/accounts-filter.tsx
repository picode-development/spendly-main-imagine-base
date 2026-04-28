"use client";

import qs from "query-string";
import {
  usePathname,
  useRouter,
  useSearchParams
} from "next/navigation";

import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useGetSummary } from "@/features/summary/api/use-get-summary";

import { 
  SelectAccount,
  SelectContentAcc,
  SelectItemAcc,
  SelectTriggerAcc,
  SelectValueAcc
 } from "./ui/select-for-account-colour-issue";

export const AccountFIlter = () => {
  const router = useRouter();
  const pathname = usePathname();

  const { isLoading: isLoadingSummary } = useGetSummary();

  const params = useSearchParams();
  const accountId = params.get("accountId") || "all";
  const categoryId = params.get("categoryId") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";

  const {
    data: accounts,
    isLoading: isLoadingAccounts,
  } = useGetAccounts();

  const onChange = (newValue: string) => {
    const query = {
      accountId: newValue === "all" ? "" : newValue,
      categoryId,
      from,
      to,
    };

    const url = qs.stringifyUrl({
      url: pathname,
      query,
    }, { skipNull: true, skipEmptyString: true });

    router.push(url);
  };

  return (
    <SelectAccount
      value={accountId}
      onValueChange={onChange}
      disabled={isLoadingAccounts || isLoadingSummary}
    >
      <SelectTriggerAcc
        className="lg:w-auto w-full h-9 rounded-md px-3 font-normal bg-white/10 hover:bg-white/20 hover:text-white border-none focus:ring-offset-0 focus:ring-transparent outline-none text-white placeholder:text-white transition flex justify-between items-center"
      >
        <SelectValueAcc placeholder="Select account" className="text-white placeholder:text-white" />
      </SelectTriggerAcc>

      <SelectContentAcc>
        <SelectItemAcc value="all">All accounts</SelectItemAcc>
        {accounts?.map((account) => (
          <SelectItemAcc key={account.id} value={account.id}>
            {account.name}
          </SelectItemAcc>
        ))}
      </SelectContentAcc>
    </SelectAccount>
  );
};