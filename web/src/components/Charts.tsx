import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Categorical slots (fixed order) and an ordinal one-hue ramp, from the validated reference palette.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const ORDINAL_BLUE = ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'];

const axisTick = { fill: 'hsl(var(--muted))', fontSize: 12 } as any;
const tooltipStyle = {
  contentStyle: { background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, direction: 'rtl' as const, fontFamily: 'inherit' },
  labelStyle: { color: 'hsl(var(--fg))', fontWeight: 600 },
  itemStyle: { color: 'hsl(var(--fg))' },
  cursor: { fill: 'hsl(var(--surface-2))' },
};

/** Horizontal bars, RTL: categories on the right, values grow leftwards. */
export function HBarChart({ data, categoryKey, series, height, stacked }: {
  data: any[]; categoryKey: string; series: { key: string; name: string; color: string }[]; height?: number; stacked?: boolean;
}) {
  const h = height || Math.max(160, data.length * 34 + 60);
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, left: 8, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis type="number" reversed allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={categoryKey} orientation="right" width={150} tick={axisTick} axisLine={false} tickLine={false} interval={0} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} iconType="circle" />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined}
              radius={stacked ? (i === series.length - 1 ? [4, 0, 0, 4] : 0) : [4, 0, 0, 4]} maxBarSize={18}
              stroke="hsl(var(--surface))" strokeWidth={stacked ? 1 : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
