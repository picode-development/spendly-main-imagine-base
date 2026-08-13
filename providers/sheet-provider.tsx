"use client";

import { useMountedState } from "react-use";

import { NewAccountSheet } from "@/features/accounts/components/new-account-sheet";
import { EditAccountSheet } from "@/features/accounts/components/edit-account-sheet";

import { NewCategorySheet } from "@/features/categories/components/new-category-sheet";
import { EditCategorySheet } from "@/features/categories/components/edit-category-sheet";
import { NewTransactionSheet } from "@/features/transactions/components/new-transaction-sheet";
import { EditTransactionSheet } from "@/features/transactions/components/edit-transaction-sheet";
import { NewTransferSheet } from "@/features/transactions/components/new-transfer-sheet";
import { PendingTransactionsPopup } from "@/features/transactions/components/pending-transactions-popup";
import { VoiceFab } from "@/features/transactions/components/voice-fab";

export const SheetProvider = () => {
    const isMounted = useMountedState();

    if (!isMounted) return null;

    return (
        <>
            <NewAccountSheet />
            <EditAccountSheet />

            <NewCategorySheet />
            <EditCategorySheet />

            <NewTransactionSheet />
            <EditTransactionSheet />
            <NewTransferSheet />
            <PendingTransactionsPopup />
            <VoiceFab />
        </>
    )
}