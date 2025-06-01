import { formatCurrency } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "next-themes";

export const CategoryTooltip = ({ active, payload }: any) => {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    if (!active) return null;

    const name = payload[0].payload.name;
    const value = payload[0].value;

    return (
        <div className={`rounded-sm ${isDark ? 'bg-card' : 'bg-white'} shadow-sm border border-border overflow-hidden`}>
            <div className={`text-sm p-2 px-3 ${isDark ? 'bg-secondary' : 'bg-muted'} ${isDark ? 'text-secondary-foreground' : 'text-muted-foreground'}`}>
                {name}
            </div>
            <Separator className={isDark ? 'bg-border' : ''} />
            <div className="p-2 px-3 space-y-1">
                <div className="flex items-center justify-between gap-x-4">
                    <div className="flex items-center gap-x-2">
                        <div className={`size-1.5 ${isDark ? 'bg-chart-5' : 'bg-rose-500'} rounded-full`} />
                        <p className={`text-sm ${isDark ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Expenses</p>
                    </div>
                    <p className={`text-sm text-right font-medium ${isDark ? 'text-foreground' : ''}`}>
                        {formatCurrency(value * -1)}
                    </p>
                </div>
            </div>
        </div>
    );
};
