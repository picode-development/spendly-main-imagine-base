"use client";

import { useMemo, useState } from "react";
import { format as formatDate } from "date-fns";
import { MessageSquarePlus, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import { parseTransactionSms, extractAnchor, FieldAnchor, SmsRule } from "@/lib/sms-parser";
import { useGetSmsRules, useCreateSmsRule, useDeleteSmsRule } from "@/features/transactions/api/use-sms-rules";

type Token = { text: string; start: number; end: number; isWord: boolean };

const tokenize = (text: string): Token[] => {
    const tokens: Token[] = [];
    const re = /\S+|\s+/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        tokens.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length,
            isWord: /\S/.test(match[0]),
        });
    }
    return tokens;
};

const FIELDS = [
    { key: "payee", label: "Name", selectedClass: "bg-primary text-primary-foreground" },
    { key: "amount", label: "Amount", selectedClass: "bg-blue-500 text-white" },
    { key: "account", label: "Account", selectedClass: "bg-amber-500 text-white" },
    { key: "date", label: "Date", selectedClass: "bg-violet-500 text-white" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Range = [number, number];
type Selections = Partial<Record<FieldKey, Range>>;

// Derive a "before/after" anchor from a tapped word range, widening the
// prefix until extraction reproduces exactly the tapped text
const deriveAnchor = (sample: string, tokens: Token[], range: Range): FieldAnchor | null => {
    const [start, end] = range;
    const selStart = tokens[start].start;
    const target = sample.slice(selStart, tokens[end].end).trim();
    if (!target) return null;

    const nextWord = tokens.slice(end + 1).find((t) => t.isWord);
    const suffix = nextWord ? nextWord.text : null;

    const precedingWords = tokens.slice(0, start).filter((t) => t.isWord);
    for (let k = 1; k <= Math.min(3, precedingWords.length); k++) {
        const anchorToken = precedingWords[precedingWords.length - k];
        const candidate: FieldAnchor = {
            prefix: sample.slice(anchorToken.start, selStart),
            suffix,
        };
        if (extractAnchor(sample, candidate) === target) return candidate;
    }
    if (precedingWords.length === 0) return null; // value at message start — unanchorable
    return {
        prefix: sample.slice(precedingWords[precedingWords.length - 1].start, selStart),
        suffix,
    };
};

// Teach Spendly your bank's SMS wording: paste a sample, pick a field, tap
// the words that hold its value — whatever sits between the surrounding
// words is captured on every future message of this format.
export const SmsFormatSettings = () => {
    const { data: rules } = useGetSmsRules();
    const createRule = useCreateSmsRule();
    const deleteRule = useDeleteSmsRule();

    const [isAdding, setIsAdding] = useState(false);
    const [sample, setSample] = useState("");
    const [matchText, setMatchText] = useState("");
    const [activeField, setActiveField] = useState<FieldKey>("payee");
    const [selections, setSelections] = useState<Selections>({});
    const [direction, setDirection] = useState<"income" | "expense" | null>(null);

    const tokens = useMemo(() => tokenize(sample), [sample]);

    const baseParse = useMemo(
        () => (sample.trim() ? parseTransactionSms(sample) : null),
        [sample],
    );
    const directionDetected = baseParse !== null && baseParse.amount !== null;

    const onSampleChange = (value: string) => {
        setSample(value);
        setSelections({});
        setDirection(null);
        const signature = value.match(/-\s*([A-Za-z][A-Za-z ]{2,30})\s*$/);
        setMatchText(signature ? signature[1].trim() : value.trim().split(/\s+/).slice(0, 4).join(" "));
    };

    const onTapWord = (index: number) => {
        setSelections((prev) => {
            const current = prev[activeField];
            if (!current) return { ...prev, [activeField]: [index, index] as Range };
            const [start, end] = current;
            if (index >= start && index <= end) {
                const next = { ...prev };
                delete next[activeField];
                return next;
            }
            return { ...prev, [activeField]: [Math.min(start, index), Math.max(end, index)] as Range };
        });
    };

    const anchors = useMemo(() => {
        const result: Partial<Record<FieldKey, FieldAnchor>> = {};
        for (const field of FIELDS) {
            const range = selections[field.key];
            if (!range) continue;
            const anchor = deriveAnchor(sample, tokens, range);
            if (anchor) result[field.key] = anchor;
        }
        return result;
    }, [selections, sample, tokens]);

    const draftRule: SmsRule | null = useMemo(() => {
        if (!sample.trim() || matchText.trim().length < 2) return null;
        return {
            matchText: matchText.trim(),
            direction: directionDetected ? "auto" : (direction ?? "auto"),
            anchors,
        };
    }, [sample, matchText, direction, directionDetected, anchors]);

    const preview = useMemo(
        () => (draftRule && sample.trim() ? parseTransactionSms(sample, [draftRule]) : null),
        [sample, draftRule],
    );

    const canSave =
        !!draftRule &&
        !!preview?.isTransaction &&
        (directionDetected || direction !== null);

    const resetForm = () => {
        setIsAdding(false);
        setSample("");
        setMatchText("");
        setSelections({});
        setActiveField("payee");
        setDirection(null);
    };

    const onSave = () => {
        if (!draftRule) return;
        createRule.mutate(
            {
                matchText: draftRule.matchText,
                direction: draftRule.direction,
                anchors: draftRule.anchors ?? null,
                sample: sample.trim() || null,
            },
            { onSuccess: resetForm },
        );
    };

    const fieldOfToken = (index: number): (typeof FIELDS)[number] | null => {
        for (const field of FIELDS) {
            const range = selections[field.key];
            if (range && index >= range[0] && index <= range[1]) return field;
        }
        return null;
    };

    return (
        <div className="py-2 px-1 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex flex-col pr-4">
                    <Label className="text-md font-medium">Bank message formats</Label>
                    <span className="text-sm text-muted-foreground">
                        If a detected transaction reads a message wrong, teach Spendly your bank&apos;s wording here.
                    </span>
                </div>
                {!isAdding && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAdding(true)}
                        className="shrink-0"
                    >
                        <MessageSquarePlus className="size-4 mr-2" />
                        Add format
                    </Button>
                )}
            </div>

            {rules && rules.length > 0 && (
                <ul className="space-y-1.5">
                    {rules.map((rule) => (
                        <li
                            key={rule.id}
                            className="flex items-center gap-3 rounded-md border px-3 py-2"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{rule.matchText}</p>
                                {rule.sample && (
                                    <p className="truncate text-xs text-muted-foreground">{rule.sample}</p>
                                )}
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                                {rule.direction === "auto" ? "Auto" : rule.direction === "income" ? "Money in" : "Money out"}
                            </Badge>
                            <button
                                type="button"
                                onClick={() => deleteRule.mutate({ id: rule.id })}
                                disabled={deleteRule.isPending}
                                aria-label={`Remove format ${rule.matchText}`}
                                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                            >
                                <X className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {isAdding && (
                <div className="space-y-4 rounded-lg border p-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="sms-sample" className="text-sm font-medium">
                            1. Paste the bank message
                        </Label>
                        <Textarea
                            id="sms-sample"
                            value={sample}
                            onChange={(e) => onSampleChange(e.target.value)}
                            placeholder="Paste the SMS exactly as your bank sent it…"
                            rows={3}
                        />
                    </div>

                    {sample.trim() && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                2. Pick a field, then tap its words in the message
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                                {FIELDS.map((field) => (
                                    <button
                                        key={field.key}
                                        type="button"
                                        onClick={() => setActiveField(field.key)}
                                        className={cn(
                                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                            activeField === field.key
                                                ? field.selectedClass
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        )}
                                    >
                                        {field.label}
                                        {selections[field.key] && " ✓"}
                                    </button>
                                ))}
                            </div>
                            <div className="rounded-md border bg-muted/30 p-3 leading-7 text-sm">
                                {tokens.map((token, i) => {
                                    if (!token.isWord) return <span key={i}>{token.text}</span>;
                                    const owner = fieldOfToken(i);
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => onTapWord(i)}
                                            className={cn(
                                                "rounded px-0.5 transition-colors",
                                                owner ? owner.selectedClass : "hover:bg-accent",
                                            )}
                                        >
                                            {token.text}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Anything you don&apos;t tap is detected automatically. Tap a highlighted word to clear it.
                            </p>
                        </div>
                    )}

                    {sample.trim() && !directionDetected && (
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                3. Is this money in or money out?{" "}
                                <span className="font-normal text-muted-foreground">
                                    (Spendly couldn&apos;t tell from the wording)
                                </span>
                            </Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={direction === "income" ? "default" : "outline"}
                                    onClick={() => setDirection("income")}
                                >
                                    Money in
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={direction === "expense" ? "default" : "outline"}
                                    onClick={() => setDirection("expense")}
                                >
                                    Money out
                                </Button>
                            </div>
                        </div>
                    )}

                    {preview && (
                        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                            {preview.isTransaction ? (
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted-foreground">Spendly will record:</span>
                                    <Badge
                                        variant={preview.amount !== null && preview.amount < 0 ? "destructive" : "primary"}
                                        className="tabular-nums"
                                    >
                                        {preview.amount !== null ? formatCurrency(preview.amount / 1000) : "?"}
                                    </Badge>
                                    <span className="font-medium">{preview.payee ?? "(no name)"}</span>
                                    {preview.accountHint && (
                                        <span className="text-xs text-muted-foreground">{preview.accountHint}</span>
                                    )}
                                    {preview.date && (
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(preview.date, "dd MMM yyyy")}
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <span className="text-muted-foreground">
                                    Waiting for an amount{directionDetected ? "" : " and a money direction"}…
                                </span>
                            )}
                        </div>
                    )}

                    <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">Advanced</summary>
                        <div className="mt-2 space-y-1.5">
                            <Label htmlFor="sms-match" className="text-xs">
                                Only apply to messages containing
                            </Label>
                            <Input
                                id="sms-match"
                                value={matchText}
                                onChange={(e) => setMatchText(e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                    </details>

                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={resetForm}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={onSave}
                            disabled={!canSave || createRule.isPending}
                        >
                            <Plus className="size-4 mr-2" />
                            Save format
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
