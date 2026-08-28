import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

// Shown by App Router the instant a navigation starts under (dashboard) —
// closes the gap between the nav highlight (updates immediately) and the
// new page's own content (previously lagged behind with nothing on screen).
// Matches the skeleton each page already shows for its own data fetch, so
// the two hand off with no visible seam.
export default function DashboardLoading() {
    return (
        <div className="mar-w-screen-2xl mx-auto w-full pb-10 -mt-24">
            <Card className="border-none drop-shadow-sm">
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                </CardHeader>
                <CardContent>
                    <div className="h-[500px] w-full flex items-center justify-center">
                        <Loader2 className="size-6 text-slate-300 animate-spin" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
