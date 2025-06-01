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
        <button
          className={cn(
            "transition-all duration-300 rounded-full p-5 text-white hover:scale-105",
            isOpen
              ? "bg-[#e3b27a] shadow-[0_0_15px_#e3b27a]"
              : "bg-blue-600 shadow-[0_0_15px_#3b82f6]"
          )}
        >
          <Plus
            className={cn(
              "size-6 transition-transform duration-300",
              isOpen ? "rotate-45" : "rotate-0"
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        sideOffset={4}
        align="center"
        className="w-48 bg-white rounded-md shadow-lg dark:bg-[#23272f] dark:text-white"
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
