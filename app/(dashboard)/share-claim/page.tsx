"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function RedirectHandler() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const query = searchParams.toString();
        router.replace(query ? `/share?${query}` : "/share");
    }, [router, searchParams]);

    return (
        <div className="flex h-[400px] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
        </div>
    );
}

export default function ShareClaimRedirect() {
    return (
        <Suspense fallback={null}>
            <RedirectHandler />
        </Suspense>
    );
}
