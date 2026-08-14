"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useVoiceAutostart } from "@/hooks/use-voice-autostart";

// Entry point for the Spendly Widgets quick actions:
//   /?widget-action=new    → open the new-transaction sheet
//   /?widget-action=photo  → same sheet (attach a receipt from there)
//   /?widget-action=voice  → start a voice recording immediately
const WidgetDeepLinksInner = () => {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const newTransaction = useNewTransaction();
    const requestVoice = useVoiceAutostart((s) => s.request);
    const fired = useRef(false);

    useEffect(() => {
        const action = searchParams.get("widget-action");
        if (!action || fired.current) return;
        fired.current = true;

        if (action === "new" || action === "photo") newTransaction.onOpen();
        if (action === "voice") requestVoice();

        router.replace(pathname, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    return null;
};

export const WidgetDeepLinks = () => (
    <Suspense fallback={null}>
        <WidgetDeepLinksInner />
    </Suspense>
);
