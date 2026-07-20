import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART } from '~/lib/constants';

interface WeightPoint {
  date: string;
  weight: number;
}

interface WeightSparklineProps {
  data: WeightPoint[];
}

/** Loaded only when the dashboard has enough weigh-ins to render a trend. */
export default function WeightSparkline({ data }: WeightSparklineProps) {
  const latestWeight = data[data.length - 1]?.weight;
  const isDark = document.documentElement.classList.contains('dark');

  return (
    <section className="card" aria-label="Weight trend">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="section-title mb-0">Weight trend</h2>
        {latestWeight !== undefined && (
          <span className="text-sm font-semibold">{latestWeight} lb</span>
        )}
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <Tooltip
              contentStyle={{
                background: isDark ? '#0f172a' : '#ffffff',
                border: `1px solid ${isDark ? CHART.gridDark : CHART.gridLight}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: CHART.textMuted }}
              itemStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
              formatter={(value: number) => [`${value} lb`, 'Weight']}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke={CHART.primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
