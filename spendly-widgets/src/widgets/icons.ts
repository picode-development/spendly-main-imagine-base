// Official Lucide icon paths — the same icon library the main app uses
// (lucide-react). Rendered in widgets via SvgWidget, which draws real SVG.
// Path data is taken verbatim from lucide.dev.
const LUCIDE_PATHS = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
    camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5L14.5 4z"/><circle cx="12" cy="13" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
} as const;

export type LucideIconName = keyof typeof LUCIDE_PATHS;

// Same SVG wrapper lucide-react emits: 24×24 viewBox, 2px round strokes
export const lucideSvg = (name: LucideIconName, color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUCIDE_PATHS[name]}</svg>`;
