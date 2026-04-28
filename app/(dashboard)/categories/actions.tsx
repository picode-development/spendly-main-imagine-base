"use client";

import { Button } from "@/components/ui/button";
import { useOpenCategory } from "@/features/categories/hooks/use-open-category";
import { useConfirm } from "@/hooks/use-confirm";
import { 
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
 } from "@/components/ui/dropdown-menu"
import { Edit, MoreHorizontal, Trash } from "lucide-react";
import { useDeleteCategory } from "@/features/categories/api/use-delete-category";

type Props = {
    id: string;
};

export const Actions = ({ id }: Props) => {
    const [ConfirmDialog, confirm] = useConfirm(
        "Are you sure?",
        "You are about to delete this category."
    )
    const deleteMutataion = useDeleteCategory(id);
    const { onOpen } = useOpenCategory();

    const handleDelete = async () => {
        const ok = await confirm();

        if (ok) {
            deleteMutataion.mutate();
        }
    };

    return (
        <>
            <ConfirmDialog />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="size-8 p-0">
                        <MoreHorizontal className="size-4 "/>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        disabled={deleteMutataion.isPending}
                        onClick={() => onOpen(id)}
                    >
                        <Edit className="size-4 mr-2"/>
                        Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={deleteMutataion.isPending}
                        onClick={handleDelete}
                    >
                        <Trash className="size-4 mr-2"/>
                        delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}