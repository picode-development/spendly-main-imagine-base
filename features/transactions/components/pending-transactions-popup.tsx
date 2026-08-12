"use client";

import { useState } from "react";
import { format } from "date-fns";
import { BellRing, ChevronDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useGetPendingTransactions } from "@/features/transactions/api/use-get-pending-transactions";
import { useDeletePendingTransaction } from "@/features/transactions/api/use-delete-pending-transaction";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

export const PendingTransactionsPopup = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { data: pending } = useGetPendingTransactions();
    const deletePending = useDeletePendingTransaction();
    const newTransaction = useNewTransaction();

    if (!pending || pending.length === 0) return null;

    if (collapsed) {
        return (
            <Button
                onClick={() => setCollapsed(false)}
                className="fixed bottom-4 left-4 z-50 h-9 rounded-full shadow-lg"
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
                notes: item.accountHint
                    ? `${item.accountHint} — ${item.rawMessage}`.slice(0, 200)
                    : item.rawMessage.slice(0, 200),
            },
        });
    };

    return (
        <div className="fixed bottom-4 left-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border bg-card text-card-foreground shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                    <BellRing className="size-4 text-primary" />
                    <span className="text-sm font-medium">
                        {pending.length} detected transaction{pending.length > 1 ? "s" : ""}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse"
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <ChevronDown className="size-4" />
                </button>
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
                            disabled={deletePending.isPending}
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
