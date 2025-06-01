import {
    Cell,
    Legend,
    Pie,
    PieChart,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

import { formatPercentage } from "@/lib/utils";
import { CategoryTooltip } from "./category-tooltip";

const COLORS = ["#0062FF", "#12c6ff", "#ff647f", "#ff9354"];

type Props = {
    data?: {
        name: string;
        value: number;
    }[];
};

export const PieVariant = ({ data = [] }: Props) => {
    return (
        <ResponsiveContainer width="100%" height={350}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="45%" // Slightly move up to make space for legend
                    outerRadius={90}
                    innerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                    strokeWidth={0} // Remove borders around pie slices
                >
                    {data.map((_entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                            stroke="none" // Ensure no stroke is applied to cells
                        />
                    ))}
                </Pie>

                <Tooltip content={<CategoryTooltip />} />

                <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="right"
                    iconType="circle"
                    content={({ payload }: any) => {
                        return (
                            <ul className="flex justify-center flex-wrap gap-x-6 pt-4">
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
                                            {formatPercentage(entry.payload.percent * 100)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        );
                    }}
                />
            </PieChart>
        </ResponsiveContainer>
    );
};