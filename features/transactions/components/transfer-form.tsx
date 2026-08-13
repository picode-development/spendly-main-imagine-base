import { z } from "zod";
import { ArrowLeftRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { AmmountInput } from "@/components/amount-input";
import { DatePicker } from "@/components/date-picker";
import { Select } from "@/components/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "./image-upload";
import { VoiceFormButton } from "./voice-form-button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { convertAmountToMiliunits } from "@/lib/utils";
import { matchOptionId } from "@/lib/match-option";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";

const formSchema = z.object({
    date: z.coerce.date(),
    fromAccountId: z.string().min(1, "Select the source account"),
    toAccountId: z.string().min(1, "Select the destination account"),
    amount: z.string().min(1, "Enter an amount"),
    imageUrls: z.array(z.object({
        url: z.string(),
        preview: z.string().optional(),
    })).max(5).nullable().optional(),
    notes: z.string().nullable().optional(),
}).refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Choose two different accounts",
    path: ["toAccountId"],
});

type FormValues = z.input<typeof formSchema>;

export type TransferValues = {
    date: Date;
    fromAccountId: string;
    toAccountId: string;
    amount: number; // positive miliunits
    imageUrls?: { url: string; preview?: string }[] | null;
    notes?: string | null;
};

type Props = {
    onSubmit: (values: TransferValues) => void;
    disabled?: boolean;
    accountOptions: { label: string; value: string }[];
    onCreateAccount: (name: string) => void;
    defaultValues?: Partial<FormValues>;
};

export const TransferForm = ({
    onSubmit,
    disabled,
    accountOptions,
    onCreateAccount,
    defaultValues,
}: Props) => {
    const newTransaction = useNewTransaction();
    const newTransfer = useNewTransfer();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            date: new Date(),
            fromAccountId: "",
            toAccountId: "",
            amount: "",
            imageUrls: null,
            notes: null,
            ...defaultValues,
        },
    });

    const handleSubmit = (values: FormValues) => {
        const amount = Math.abs(convertAmountToMiliunits(parseFloat(values.amount)));

        if (!amount) {
            form.setError("amount", { message: "Enter an amount greater than zero" });
            return;
        }

        onSubmit({
            date: values.date as Date,
            fromAccountId: values.fromAccountId,
            toAccountId: values.toAccountId,
            amount,
            imageUrls: values.imageUrls,
            notes: values.notes,
        });
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4 pt-4"
            >
                <FormField
                    name="date"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <DatePicker
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    name="fromAccountId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>From account</FormLabel>
                            <FormControl>
                                <Select
                                    placeholder="Select the source account"
                                    options={accountOptions}
                                    onCreate={onCreateAccount}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="toAccountId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>To account</FormLabel>
                            <FormControl>
                                <Select
                                    placeholder="Select the destination account"
                                    options={accountOptions}
                                    onCreate={onCreateAccount}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="amount"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                                <AmmountInput
                                    {...field}
                                    disabled={disabled}
                                    placeholder="0.00"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="imageUrls"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Receipt / Images</FormLabel>
                            <FormControl>
                                <ImageUpload
                                    value={field.value ?? []}
                                    onChange={(urls) => field.onChange(urls.length ? urls : null)}
                                    disabled={disabled}
                                    max={5}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    name="notes"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    value={field.value ?? ""}
                                    disabled={disabled}
                                    placeholder="Optional notes"
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <div className="flex w-full gap-2">
                    <Button className="flex-1" disabled={disabled}>
                        <ArrowLeftRight className="size-4 mr-2" />
                        Transfer funds
                    </Button>
                    <VoiceFormButton
                        disabled={disabled}
                        onParsed={(parsed, transcript) => {
                            if (!parsed) return;
                            // A "switch to transaction form" command or plainly
                            // spoken transaction → the normal form, carrying over
                            // anything already typed here
                            if (
                                parsed.switchTo === "transaction" ||
                                (!parsed.isTransfer && parsed.switchTo !== "transfer" && (parsed.amount != null || parsed.payee))
                            ) {
                                const current = form.getValues();
                                newTransfer.onClose();
                                newTransaction.onOpen({
                                    prefill: {
                                        date: parsed.date
                                            ? new Date(parsed.date)
                                            : (current.date as Date | undefined),
                                        payee: parsed.payee ?? "",
                                        amount: parsed.amount != null
                                            ? String(parsed.amount / 1000)
                                            : (current.amount || ""),
                                        notes: parsed.note
                                            ?? (typeof current.notes === "string" && current.notes ? current.notes : undefined)
                                            ?? (parsed.switchTo ? undefined : transcript),
                                        accountName: parsed.accountName
                                            ?? accountOptions.find((o) => o.value === current.fromAccountId)?.label,
                                        categoryName: parsed.categoryName ?? undefined,
                                    },
                                });
                                return;
                            }
                            if (parsed.date) form.setValue("date", new Date(parsed.date));
                            if (parsed.amount != null) form.setValue("amount", String(Math.abs(parsed.amount) / 1000));
                            if (parsed.note || transcript) form.setValue("notes", parsed.note ?? transcript);
                            const fromId = matchOptionId(accountOptions, parsed.accountName);
                            if (fromId) form.setValue("fromAccountId", fromId);
                            const toId = matchOptionId(accountOptions, parsed.toAccountName);
                            if (toId) form.setValue("toAccountId", toId);
                        }}
                    />
                </div>
            </form>
        </Form>
    );
};
