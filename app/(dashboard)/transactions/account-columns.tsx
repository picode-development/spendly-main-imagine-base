import { useOpenAccount } from "@/features/accounts/hooks/use-open-account";

type Props = {
    account: string;
    accountId: string,
};

export const AccountColumns = ({
    account,
    accountId,
}: Props) => {
    const { onOpen: onOpenAccount } = useOpenAccount();

    const onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onOpenAccount(accountId);
    };

    return (
        <div
            onClick={onClick}
            className="flex items-center cursor-pointer hover:underline"
        >
            {account}
        </div>
    );
};