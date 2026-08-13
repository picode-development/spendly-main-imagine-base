import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { useCreateTransfer } from "@/features/transactions/api/use-create-transfer";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useCreateAccount } from "@/features/accounts/api/use-create-account";
import { TransferForm, TransferValues } from "@/features/transactions/components/transfer-form";
import { Loader2 } from "lucide-react";

const matchOption = (
    options: { label: string; value: string }[],
    name?: string,
): string => {
    if (!name) return "";
    return options.find(
        (o) => o.label.trim().toLowerCase() === name.trim().toLowerCase(),
    )?.value ?? "";
};

export const NewTransferSheet = () => {
    const { isOpen, onClose, prefill, prefillKey } = useNewTransfer();

    const accountQuery = useGetAccounts();
    const accountMutation = useCreateAccount();
    const onCreateAccount = (name: string) => accountMutation.mutate({
        name
    });

    const accountOptions = (accountQuery.data ?? []).map((account) => ({
        label: account.name,
        value: account.id,
    }));

    const createMutation = useCreateTransfer();

    const isPending =
        createMutation.isPending ||
        accountMutation.isPending;

    const onSubmit = (values: TransferValues) => {
        createMutation.mutate(values, {
            onSuccess: () => {
                onClose();
            }
        });
    };

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="space-y-4 overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>
                        Transfer Funds
                    </SheetTitle>
                    <SheetDescription>
                        Move money between your accounts. Transfers don&apos;t count as income or expenses.
                    </SheetDescription>
                </SheetHeader>
                {accountQuery.isLoading
                    ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="size-4 text-muted-foreground animate-spin"/>
                        </div>
                    )
                    : (
                        <TransferForm
                            key={prefillKey ?? "blank"}
                            onSubmit={onSubmit}
                            disabled={isPending}
                            accountOptions={accountOptions}
                            onCreateAccount={onCreateAccount}
                            defaultValues={prefill ? {
                                date: prefill.date ?? new Date(),
                                fromAccountId: matchOption(accountOptions, prefill.fromAccountName),
                                toAccountId: matchOption(accountOptions, prefill.toAccountName),
                                amount: prefill.amount ?? "",
                                notes: prefill.notes ?? null,
                            } : undefined}
                        />
                    )
                }
            </SheetContent>
        </Sheet>
    );
};
