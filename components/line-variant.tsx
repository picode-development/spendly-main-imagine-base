import { format } from "date-fns";
import {
    Tooltip,
    XAxis,
    LineChart,
    Line,
    ResponsiveContainer,
    CartesianGrid
} from "recharts";

import { CustomTooltip } from "@/components/custom-tooltip";

type Props = {
    data: {
        date: string;
        income: number;
        expenses: number;
    }[];
    theme: "light" | "dark";
};

export const LineVarient = ({ data, theme }: Props) => {
    const isDark = theme === "dark";

    const gridStroke = isDark
        ? "var(--chart-grid-dark)"
        : "var(--chart-grid-light)";

    const tickColor = isDark
        ? "var(--chart-axis-text-dark)"
        : "var(--chart-axis-text-light)";
        
    // Define dynamic chart colors based on theme
    const incomeColor = isDark ? "var(--chart-1)" : "#3d82f6";
    const expensesColor = isDark ? "var(--chart-5)" : "#f43f5e";

    return (
        <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis 
                    axisLine={false}
                    tickLine={false}
                    dataKey="date"
                    tickFormatter={(value) => format(value, "dd MMM")}
                    style={{ fontSize: "12px" }}
                    tick={{ fill: tickColor }}
                    tickMargin={16}
                />

                <Tooltip content={<CustomTooltip />} />
                <Line 
                    dot={false}
                    dataKey="income"
                    stroke={incomeColor}
                    strokeWidth={2}
                    className="drop-shadow-sm"
                />
                <Line 
                    dot={false}
                    dataKey="expenses"
                    stroke={expensesColor}
                    strokeWidth={2}
                    className="drop-shadow-sm"
                />
            </LineChart>
        </ResponsiveContainer>
    );
};