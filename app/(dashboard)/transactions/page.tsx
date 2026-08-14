"use client"
import { Button } from "@/components/ui/button";
import { 
    Card,
    CardContent,
    CardHeader,
    CardTitle,
 } from "@/components/ui/card";
import { transactions as transactionsSchema } from "@/db/schema";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";
import { columns } from "./columns";
import { DataTable } from "@/components/data-table";
import { useGetTransactions } from "@/features/transactions/api/use-get-transactions";
import { Skeleton } from "@/components/ui/skeleton";
import { useBulkDeleteTransactions } from "@/features/transactions/api/use-bulk-delete-transactions";
import { useState } from "react";
import { UploadButton } from "./upload-button";
import { ImportCard } from "./import-card";
import { useSelectAccount } from "@/features/accounts/hooks/use-select-account.";
import { toast } from "sonner";
import { useBulkCreateTransactions } from "@/features/transactions/api/use-bulk-create-transactions";

enum VARIENTS {
    LIST = "LIST",
    IMPORT = "IMPORT"
};

const INITIAL_IMPORT_RESULTS = {
    data: [],
    errors: [],
    meta: {},
};

const TransactionsPage = () => {

    const [AccountDialog, confirm] = useSelectAccount();

    const [variant, setVariant] = useState<VARIENTS>(VARIENTS.LIST);
    const [importResult, setImportResults] = useState (INITIAL_IMPORT_RESULTS);

    // Widget 🔍 deep link (/transactions?search=1) — focus the search box
    const [autoFocusSearch] = useState(() =>
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("search"));

    const onUpload = (results: typeof INITIAL_IMPORT_RESULTS) => {
        console.log({ results });
        setImportResults(results);
        setVariant(VARIENTS.IMPORT);
    };

    const onCancelImport = () => {
        setImportResults(INITIAL_IMPORT_RESULTS);
        setVariant(VARIENTS.LIST);
    };

    const newTransaction = useNewTransaction();
    const newTransfer = useNewTransfer();
    const openTransaction = useOpenTransaction();
    const createTransactions = useBulkCreateTransactions();
    const deleteTransactions = useBulkDeleteTransactions();
    const transactionsQuery = useGetTransactions();
    const transactions = transactionsQuery.data || [];

    const isDisabled = 
        transactionsQuery.isLoading ||
        deleteTransactions.isPending;

    const onSubmitImport = async (
        values: typeof transactionsSchema.$inferInsert[],
    ) => {
        const accountId = await confirm();

        if (!accountId) {
            return toast.error("Please select an account to continue.");
        }

        const data = values.map((value) => ({
            ...value,
            accountId: accountId as string,
        }));

        createTransactions.mutate(data, {
            onSuccess: () => {
                onCancelImport();
            },
        });
    };

    if (transactionsQuery.isLoading) {
        return (
            <div className="mar-w-screen-2xl mx-auto w-full pb-10 -mt-24 ">
                <Card className="border-none drop-shadow-sm">
                    <CardHeader>
                        <Skeleton className="h-8 w-48 " />
                    </CardHeader>
                    <CardContent>
                        <div className="h-[500px] w-full flex items-center justify-center">
                            <Loader2 className="size-6 text-slade-300 animate-spin"/>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    };

    if (variant === VARIENTS.IMPORT) {
        return (
            <>

                <AccountDialog />

                <ImportCard 
                    data={importResult.data}
                    onCancel={onCancelImport}
                    onSubmit={onSubmitImport}
                />
            </>
        );
    }
 
    return (
        <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
            <Card className="border-none drop-shadow-sm">
                <CardHeader className="gap-y-2 lg:flex lg:flex-row lg:items-center lg:justify-between md:flex md:flex-row md:items-center md:justify-between">
                    <CardTitle className="text-xl line-clamp-1">
                        Transactions History
                    </CardTitle>
                    <div className="flex flex-col lg:flex-row gap-y-2 items-center gap-x-2 ">
                        <Button
                        onClick={() => newTransaction.onOpen()}
                        size="sm"
                        className="w-full lg:w-auto"
                        >
                            <Plus className="size-4 mr-2" />
                            Add New
                        </Button>
                        <Button
                        onClick={() => newTransfer.onOpen()}
                        size="sm"
                        className="w-full lg:w-auto"
                        >
                            <ArrowLeftRight className="size-4 mr-2" />
                            Transfer
                        </Button>
                        <UploadButton onUpload={onUpload} />
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        filterKey="payee"
                        searchPlaceholder="Search..."
                        autoFocusSearch={autoFocusSearch}
                        columns={columns}
                        data={transactions}
                        onDelete={(row) => {
                            const ids = row.map((r) => r.original.id);
                            deleteTransactions.mutate({ ids });
                        }}
                        disabled={isDisabled}
                        onRowClick={(row) => openTransaction.onOpen(row.original.id)}
                    />
                        
                </CardContent>
            </Card>
        </div>
    );
};

export default TransactionsPage;