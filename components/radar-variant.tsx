import {
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer
} from "recharts";
import { useTheme } from "next-themes";

type Props = {
    data?: {
        name: string;
        value: number;
    }[];
    theme?: "light" | "dark";
};

export const RadarVariant = ({ data = [], theme }: Props) => {
    const themeContext = useTheme();
    const isDark = theme === "dark" || (!theme && themeContext.theme === "dark");
    const gradientId = isDark ? "radarGradientDark" : "radarGradientLight";
    const gridStroke = isDark ? "#334155" : "#e5e7eb"; 
    const textColor = isDark ? "#ffffff" : "#000000";

    return (
        <ResponsiveContainer width="100%" height={350}>
            <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
                <defs>
                    {/* Light mode: center is soft blue, edge is bright blue */}
                    <radialGradient id="radarGradientLight" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
                        <stop offset="80%" stopColor="#3b82f6" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.45} />
                    </radialGradient>
                    {/* Dark mode: center is soft blue, edge is more vibrant blue */}
                    <radialGradient id="radarGradientDark" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.13} />
                        <stop offset="80%" stopColor="#38bdf8" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.42} />
                    </radialGradient>
                </defs>

                <PolarGrid stroke={gridStroke} />

                <PolarAngleAxis
                    dataKey="name"
                    tick={({ payload, x, y, textAnchor }) => {
                        const value = payload?.value;
                        const centerX = 175;
                        const isLeftOrRight = x < centerX || x > centerX;
                        const words = isLeftOrRight && value.includes(" ") ? value.split(" ") : [value];
                        const dyOffset = isLeftOrRight ? -8 * (words.length - 1) : 0;

                        return (
                            <text
                                x={x}
                                y={y + dyOffset}
                                textAnchor={textAnchor}
                                fill={textColor}
                                fontSize={12}
                                opacity={0.6}
                            >
                                {words.map((word: string, index: number) => (
                                    <tspan key={index} x={x} dy={index === 0 ? 0 : 14}>
                                        {word}
                                    </tspan>
                                ))}
                            </text>
                        );
                    }}
                />

                <PolarRadiusAxis
                    tick={{ fill: textColor, fontSize: 13, fontWeight: "bold", opacity: "0.8" }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                />

                <Radar
                    dataKey="value"
                    stroke={isDark ? "#38bdf8" : "#3b82f6"}
                    strokeOpacity={0.7}
                    fill={`url(#${gradientId})`}
                    fillOpacity={1}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
};
