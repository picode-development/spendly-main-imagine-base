import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { InsertTransactionSchema } from "@/db/schema";
import { z } from "zod";
import { 
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
 } from "@/components/ui/sheet";
import { useCreateTransaction } from "@/features/transactions/api/use-create-transaction";
import { useCreateCategory } from "@/features/categories/api/use-create-category";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useCreateAccount } from "@/features/accounts/api/use-create-account";
import { TransactionForm } from "@/features/transactions/components/transaction-form";
import { useDeletePendingTransaction } from "@/features/transactions/api/use-delete-pending-transaction";
import { Loader2 } from "lucide-react";

 const formSchema = InsertTransactionSchema.omit({
    id: true,
 });

type FormValues = z.input<typeof formSchema>;

 export const NewTransactionSheet = () => {
    const { isOpen, onClose, prefill, pendingId } = useNewTransaction();

    const categoryQuery = useGetCategories();
    const categoryMutation = useCreateCategory();
    const onCreateCategory = (name: string) => categoryMutation.mutate({
        name
    });

    const categoryOptions = (categoryQuery.data ?? []).map((category) => ({
        label: category.name,
        value: category.id,
    }));

    const accountQuery = useGetAccounts();
    const accountMutation = useCreateAccount();
    const onCreateAccount = (name: string) => accountMutation.mutate({
        name
    });

    const accountOptions = (accountQuery.data ?? []).map((account) => ({
        label: account.name,
        value: account.id,
    }));

    const createMutation = useCreateTransaction();
    const deletePending = useDeletePendingTransaction();

    const isPending =
        createMutation.isPending ||
        categoryMutation.isPending ||
        accountMutation.isPending;

    const isLoading =
        categoryQuery.isLoading ||
        accountQuery.isLoading;

    const onSubmit = (values: FormValues) => {
        createMutation.mutate(values, {
            onSuccess: () => {
                // Confirming a detected transaction clears it from the popup
                if (pendingId) {
                    deletePending.mutate({ id: pendingId, silent: true });
                }
                onClose();
            }
        });
    };

    

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="space-y-4 overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>
                        New Transaction
                    </SheetTitle>
                    <SheetDescription>
                        Create a new transaction to manage your money.
                    </SheetDescription>
                </SheetHeader>
                {isLoading
                    ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="size-4 text-muted-foreground animate-spin"/> 
                        </div>
                    )
                    : (
                        <TransactionForm
                            key={pendingId ?? "blank"}
                            defaultValues={{
                            date: prefill?.date ?? new Date(),
                            accountId: "",
                            categoryId: null,
                            payee: prefill?.payee ?? "",
                            amount: prefill?.amount ?? "",
                            imageUrls: null,
                            notes: prefill?.notes ?? null,
                            }}
                            onSubmit={onSubmit}
                            disabled={isPending}
                            categoryOptions={categoryOptions}
                            onCreateCategory={onCreateCategory}
                            accountOptions={accountOptions}
                            onCreateAccount={onCreateAccount} 
                        />
                    )
                }
                
            </SheetContent>
        </Sheet>
    );
 };