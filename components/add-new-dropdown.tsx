"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, List, Wallet, Tags } from "lucide-react";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const AddNewDropdown = () => {
  const newTransaction = useNewTransaction();
  const newAccount = useNewAccount();
  const newCategory = useNewCategory();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold text-sm text-white transition-all duration-200",
            isOpen
              ? "bg-[#e3b27a] shadow-[0_0_15px_#e3b27a] text-black"
              : "bg-[#e5e5e518] shadow-[0_0_4px_rgba(255,255,255,0.2)] hover:bg-[#e3b27a] hover:shadow-[0_0_15px_#e3b27a] hover:text-black active:bg-[#c7c7c7] active:shadow-[0_0_4px_rgba(255,255,255,0.2)]" +
                " dark:hover:bg-[#e3b27a] dark:hover:shadow-[0_0_15px_#e3b27a] dark:hover:text-black"
          )}
        >
          <Plus className="h-4 w-4" />
          <span>Create New</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-48 bg-white shadow-xl rounded-md
                   dark:bg-[#23272f] dark:shadow-xl dark:text-white"
      >
        <DropdownMenuItem
          onClick={newTransaction.onOpen}
          className="hover:bg-gray-100 dark:hover:bg-[#353941] dark:text-white"
        >
          <List className="mr-2 h-4 w-4" />
          New Transaction
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={newAccount.onOpen}
          className="hover:bg-gray-100 dark:hover:bg-[#353941] dark:text-white"
        >
          <Wallet className="mr-2 h-4 w-4" />
          New Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={newCategory.onOpen}
          className="hover:bg-gray-100 dark:hover:bg-[#353941] dark:text-white"
        >
          <Tags className="mr-2 h-4 w-4" />
          New Category
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
