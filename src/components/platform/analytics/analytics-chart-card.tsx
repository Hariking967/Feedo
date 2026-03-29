"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

interface AnalyticsChartCardProps {
  title: string;
  type: "line" | "bar" | "donut";
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
}

const colors = ["#16a34a", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6"];

export function AnalyticsChartCard({ title, type, data, xKey = "day", yKey = "value" }: AnalyticsChartCardProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey={yKey} stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          ) : type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={yKey} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <PieChart>
              <Pie data={data} dataKey={yKey} nameKey={xKey} innerRadius={50} outerRadius={80}>
                {data.map((entry, index) => (
                  <Cell key={`${entry[xKey]}-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
