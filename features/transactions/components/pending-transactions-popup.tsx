"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { format } from "date-fns";
import { BellRing, ChevronDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useGetPendingTransactions } from "@/features/transactions/api/use-get-pending-transactions";
import { useDeletePendingTransaction } from "@/features/transactions/api/use-delete-pending-transaction";
import { useClearPendingTransactions } from "@/features/transactions/api/use-clear-pending-transactions";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { useOpenAccount } from "@/features/accounts/hooks/use-open-account";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";
import { useOpenCategory } from "@/features/categories/hooks/use-open-category";
import { usePendingPopup } from "@/features/transactions/hooks/use-pending-popup";

export const PendingTransactionsPopup = () => {
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();
    const { data: pending } = useGetPendingTransactions();
    const deletePending = useDeletePendingTransaction();
    const clearAll = useClearPendingTransactions();
    const newTransaction = useNewTransaction();
    const setPopupExpanded = usePendingPopup((s) => s.setExpanded);

    // Step aside while any sheet is open — the popup must never cover a form
    const anySheetOpen = [
        newTransaction.isOpen,
        useOpenTransaction((s) => s.isOpen),
        useNewTransfer((s) => s.isOpen),
        useNewAccount((s) => s.isOpen),
        useOpenAccount((s) => s.isOpen),
        useNewCategory((s) => s.isOpen),
        useOpenCategory((s) => s.isOpen),
    ].some(Boolean);

    const onShareScreen = pathname === "/share-claim" || pathname === "/share";
    const hasPending = !!pending && pending.length > 0;
    // Expanded = the full card is showing (not collapsed, visible, has items).
    // The voice ball reads this to step aside on phones.
    const isExpanded = !anySheetOpen && !onShareScreen && hasPending && !collapsed;

    useEffect(() => {
        setPopupExpanded(isExpanded);
    }, [isExpanded, setPopupExpanded]);
    useEffect(() => () => setPopupExpanded(false), [setPopupExpanded]);

    if (anySheetOpen) return null;
    // The share-claim screen has its own progress/reward card — stay out of it
    if (pathname === "/share-claim" || pathname === "/share") return null;
    if (!pending || pending.length === 0) return null;

    if (collapsed) {
        return (
            <Button
                onClick={() => setCollapsed(false)}
                // bottom-20 on mobile clears the fixed bottom navigation bar
                className="fixed bottom-20 lg:bottom-4 left-4 z-[60] h-9 rounded-full shadow-lg origin-bottom-left animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-300 ease-out"
            >
                <BellRing className="size-4 mr-2" />
                {pending.length} detected
            </Button>
        );
    }

    const onAdd = (item: (typeof pending)[number]) => {
        newTransaction.onOpen({
            pendingId: item.id,
            prefill: {
                date: new Date(item.date),
                payee: item.payee ?? "",
                amount: item.amount === null ? "" : String(item.amount),
                // Prefer the LLM's clean one-liner; fall back to the account hint
                notes: item.note ?? item.accountHint ?? undefined,
                // LLM-matched names resolve to the right account/category ids
                accountName: item.accountHint ?? undefined,
                categoryName: item.categoryHint ?? undefined,
                // A shared payment screenshot arrives already attached
                imageUrls: item.imageUrls ?? undefined,
            },
        });
    };

    return (
        // Expanded: the voice ball hides on phones (see VoiceFab), so the card
        // can take near-full width; capped to a tidy panel on larger screens.
        <div className="fixed bottom-20 lg:bottom-4 left-4 right-4 sm:right-auto z-[60] sm:w-[22rem] rounded-lg border bg-card text-card-foreground shadow-lg origin-bottom-left animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300 ease-out">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                    <BellRing className="size-4 text-primary" />
                    <span className="text-sm font-medium">
                        {pending.length} detected transaction{pending.length > 1 ? "s" : ""}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {pending.length > 1 && (
                        <button
                            type="button"
                            onClick={() => clearAll.mutate()}
                            disabled={clearAll.isPending}
                            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                        >
                            Clear all
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        aria-label="Collapse"
                        className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronDown className="size-4" />
                    </button>
                </div>
            </div>

            <ul className="max-h-72 overflow-y-auto p-2 space-y-1">
                {pending.map((item) => (
                    <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent/50"
                    >
                        <Badge
                            variant={item.amount !== null && item.amount < 0 ? "destructive" : "primary"}
                            className={cn(
                                "shrink-0 tabular-nums",
                                item.amount === null && "bg-muted text-muted-foreground",
                            )}
                        >
                            {item.amount === null ? "?" : formatCurrency(item.amount)}
                        </Badge>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                                {item.payee ?? item.rawMessage.slice(0, 40)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {format(new Date(item.date), "dd MMM")}
                                {item.accountHint && <> · {item.accountHint}</>}
                            </p>
                        </div>
                        <Button
                            size="sm"
                            className="h-7 px-2.5"
                            onClick={() => onAdd(item)}
                        >
                            <Plus className="size-3.5 mr-1" />
                            Add
                        </Button>
                        <button
                            type="button"
                            onClick={() => deletePending.mutate({ id: item.id })}
                            aria-label="Dismiss"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                        >
                            <X className="size-3.5" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
