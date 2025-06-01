import {
    RadialBar,
    RadialBarChart,
    Legend,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

import { formatCurrency } from "@/lib/utils";
import { CategoryTooltip } from "./category-tooltip";

const COLORS = ["#0062FF", "#12c6ff", "#ff647f", "#ff9354"];

type Props = {
    data?: {
        name: string;
        value: number;
    }[];
};

export const RadialVariant = ({ data = [] }: Props) => {
    const formattedData = data.map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length],
    }));

    return (
        <ResponsiveContainer width="100%" height={350}>
            <RadialBarChart
                cx="50%"
                cy="40%" // shift up for legend space
                barSize={10}
                innerRadius="90%"
                outerRadius="40%"
                data={formattedData}
            >
                <RadialBar
                    dataKey="value"
                    cornerRadius={5}
                    background={{ fill: 'var(--ring-bg)' }}
                />

                <Tooltip content={<CategoryTooltip />} />

                <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    content={({ payload }: any) => (
                        <ul className="flex justify-center flex-wrap gap-x-6 pt-6">
                            {payload.map((entry: any, index: number) => (
                                <li
                                    key={`item-${index}`}
                                    className="flex items-center gap-x-2"
                                >
                                    <span
                                        className="size-2.5 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-sm text-muted-foreground">
                                        {entry.value}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {formatCurrency(entry.payload.value)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                />
            </RadialBarChart>
        </ResponsiveContainer>
    );
};
