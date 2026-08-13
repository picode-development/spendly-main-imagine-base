/**
 * Resolves a spoken/LLM-returned account or category NAME to the option id.
 * Forgiving on purpose: ignores case, spacing, and punctuation, and falls
 * back to containment ("Flux" → "Flux Media ") when no exact match exists.
 */
export const matchOptionId = (
    options: { label: string; value: string }[],
    name?: string | null,
): string => {
    if (!name) return "";
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = normalize(name);
    if (!target) return "";

    const exact = options.find((o) => normalize(o.label) === target);
    if (exact) return exact.value;

    const partial = options.find((o) => {
        const label = normalize(o.label);
        return label.includes(target) || target.includes(label);
    });
    return partial?.value ?? "";
};
