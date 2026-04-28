import { format, parseISO } from "date-fns";
import {
  Tooltip,
  XAxis,
  BarChart,
  Bar,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useEffect, useState } from "react";

import { CustomTooltip } from "@/components/custom-tooltip";

type Props = {
  data: {
    date: string;
    income: number;
    expenses: number;
  }[];
  theme: "light" | "dark";
};

export const BarVarient = ({ data, theme }: Props) => {
  const isDark = theme === "dark";

  // Determine grid and tick colors based on the theme
  const gridStroke = isDark
    ? "var(--chart-grid-dark)"
    : "var(--chart-grid-light)";
  
  const tickColor = isDark
    ? "var(--chart-axis-text-dark)"
    : "var(--chart-axis-text-light)";

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        {/* Apply grid stroke color based on theme */}
        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
        
        <XAxis
          axisLine={false}
          tickLine={false}
          dataKey="date"
          tickFormatter={(value) => format(parseISO(value), "dd MMM")}
          style={{ fontSize: "12px" }}
          tick={{ fill: tickColor }} // Apply tick color based on theme
          tickMargin={16}
        />
        
        <Tooltip content={<CustomTooltip />} />
        
        {/* Bar components for income and expenses */}
        <Bar
          dataKey="income"
          fill="#3d82f6"
          className="drop-shadow-sm"
        />
        <Bar
          dataKey="expenses"
          fill="#f43f5e"
          className="drop-shadow-sm"
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
