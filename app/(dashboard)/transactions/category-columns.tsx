
import { useOpenCategory } from "@/features/categories/hooks/use-open-category";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";

import { cn } from "@/lib/utils";
import { ArrowLeftRight, TriangleAlert } from "lucide-react";
type Props = {
    id: string;
    category: string | null;
    categoryId: string | null,
    transferId?: string | null,
};

export const CategoryColumns = ({
    id,
    category,
    categoryId,
    transferId,
}: Props) => {
    const { onOpen: onOpenCategory } = useOpenCategory();
    const { onOpen: onOpenTransaction } = useOpenTransaction();

    const onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (categoryId) {
            onOpenCategory(categoryId);
        } else {
            onOpenTransaction(id);
        }
    };

    // Transfers between accounts are neither income nor expense — show a
    // neutral marker instead of the "Uncategorized" warning
    if (transferId) {
        return (
            <div
                onClick={onClick}
                className="flex items-center cursor-pointer text-muted-foreground hover:underline"
            >
                <ArrowLeftRight className="mr-2 size-4 shrink-0" />
                Transfer
            </div>
        );
    }

    return (
        <div
        onClick={onClick}
            className={cn(
                "flex items-center cursor-pointer hover:underline",
                !category && "text-rose-500 ",
            )}
        >
            {!categoryId && <TriangleAlert className="mr-2 size-4 shrink-0" />}
            {category || "Uncategorized"}
        </div>
    );
};