import { z } from "zod";
import { Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AmmountInput } from "@/components/amount-input";
import { InsertTransactionSchema } from "@/db/schema";
import { DatePicker } from "@/components/date-picker";
import { Select } from "@/components/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "./image-upload";
import { VoiceFieldButton } from "./voice-field-button";
import { VoiceFormButton } from "./voice-form-button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from "@/components/ui/form";
import { convertAmountToMiliunits } from "@/lib/utils";

const formSchema = z.object({
    date: z.coerce.date(),
    accountId: z.string(),
    categoryId: z.string().nullable().optional(),
    payee: z.string(),
    amount: z.string(),
    imageUrls: z.array(z.object({
        url: z.string(),
        preview: z.string().optional(),
    })).max(5).nullable().optional(),
    notes: z.string().nullable().optional(),
});

const apiSchema = InsertTransactionSchema.omit({
    id: true,
});

type FormValues = z.input<typeof formSchema>;
type ApiFormValues = z.input<typeof apiSchema>;

type Props = {
    id?: string;
    defaultValues: FormValues;
    onSubmit: (values: ApiFormValues) => void;
    onDelete?: () => void;
    disabled?: boolean;
    accountOptions: { label: string; value: string }[];
    categoryOptions: { label: string; value: string }[];
    onCreateAccount: (name: string) => void;
    onCreateCategory: (name: string) => void;
};

export const TransactionForm = ({
    id,
    defaultValues,
    onSubmit,
    onDelete,
    disabled,
    accountOptions,
    categoryOptions,
    onCreateAccount,
    onCreateCategory,
}: Props) => {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: defaultValues,
    });

    const handleSubmit = (values: FormValues) => {
        const amount = parseFloat(values.amount);
        const amountInMiliunits = convertAmountToMiliunits(amount);

        onSubmit({
            ...values,
            amount: amountInMiliunits,
        });
    };

    const handleDelete = () => {
        onDelete?.();
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
                    name="accountId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Account</FormLabel>
                            <FormControl>
                                <Select
                                    placeholder="Select an account"
                                    options={accountOptions}
                                    onCreate={onCreateAccount}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    name="categoryId"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                                <Select
                                    placeholder="Select a category"
                                    options={categoryOptions}
                                    onCreate={onCreateCategory}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    name="payee"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center justify-between">
                                <FormLabel>Payee</FormLabel>
                                <VoiceFieldButton
                                    label="payee"
                                    field="payee"
                                    onResult={(text) => form.setValue("payee", text.replace(/[.।]\s*$/, ""))}
                                />
                            </div>
                            <FormControl>
                                <Input
                                    disabled={disabled}
                                    placeholder="Add a payee"
                                    {...field}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    name="amount"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center justify-between">
                                <FormLabel>Amount</FormLabel>
                                <VoiceFieldButton
                                    label="amount"
                                    field="amount"
                                    onResult={(text) => {
                                        const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
                                        if (match) form.setValue("amount", match[0]);
                                    }}
                                />
                            </div>
                            <FormControl>
                                <AmmountInput
                                    {...field}
                                    disabled={disabled}
                                    placeholder="0.00"
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                {/* 👇 NEW — before Notes */}
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
                            <div className="flex items-center justify-between">
                                <FormLabel>Notes</FormLabel>
                                <VoiceFieldButton
                                    label="notes"
                                    field="notes"
                                    onResult={(text) => form.setValue("notes", text)}
                                />
                            </div>
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
                    <Button className="flex-[3]" disabled={disabled}>
                        {id ? "Save Changes" : "Create transaction"}
                    </Button>
                    <VoiceFormButton
                        disabled={disabled}
                        onParsed={(parsed, transcript) => {
                            if (!parsed) return;
                            if (parsed.date) form.setValue("date", new Date(parsed.date));
                            if (parsed.payee) form.setValue("payee", parsed.payee);
                            if (parsed.amount != null) form.setValue("amount", String(parsed.amount / 1000));
                            if (parsed.note || transcript) form.setValue("notes", parsed.note ?? transcript);
                            const accountId = accountOptions.find(
                                (o) => o.label.trim().toLowerCase() === parsed.accountName?.trim().toLowerCase(),
                            )?.value;
                            if (accountId) form.setValue("accountId", accountId);
                            const categoryId = categoryOptions.find(
                                (o) => o.label.trim().toLowerCase() === parsed.categoryName?.trim().toLowerCase(),
                            )?.value;
                            if (categoryId) form.setValue("categoryId", categoryId);
                        }}
                    />
                </div>

                {!!id && (
                    <Button
                        type="button"
                        disabled={disabled}
                        onClick={handleDelete}
                        className="w-full"
                        variant="outline"
                    >
                        <Trash className="size-4 mr-2" />
                        <span>Delete transaction</span>
                    </Button>
                )}
            </form>
        </Form>
    );
};