import { memo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate, pluralize } from '@/utils/formatters';
import { CHART_GRID, CHART_INK, TREND_SERIES } from '@/utils/constants';

// The chart reads the trend endpoint, one point per day ending today. Series names and colours come from
// the shared constants, so the same series cannot be green here and teal on the list page. Both axes use
// the one grey, and the legend repeats the swatch the tooltip draws, so the chart explains itself without
// a colour key hidden in a tooltip.
function TrendChart({ data = [] }) {
  return (
    <div className="w-full">
      <ul className="mb-3 flex flex-wrap items-center gap-4">
        {TREND_SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-pill" style={{ background: series.color }} aria-hidden="true" />
            {series.label}
          </li>
        ))}
      </ul>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={CHART_GRID} />

            <XAxis
              dataKey="date"
              tickFormatter={(date) => formatDate(date, { weekday: 'short' })}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: CHART_INK }}
              dy={6}
            />
            {/* integers only: a count of 0.5 of an appointment is meaningless on a gridline */}
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: CHART_INK }}
              width={48}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: CHART_GRID }} />

            {TREND_SERIES.map((series) => (
              <Area
                key={series.key}
                // monotone joins the points without inventing a dip between two real days
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                fill={series.color}
                fillOpacity={series.fillOpacity}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// The default tooltip is a light grey box with a black border that belongs to no design system, so the
// card surface is drawn here instead.
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-card bg-card px-3 py-2 shadow-pop">
      <p className="text-xs font-semibold text-ink">{formatDate(label, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="h-2 w-2 rounded-pill" style={{ background: entry.color }} aria-hidden="true" />
            <span className="flex-1">{entry.name}</span>
            <span className="font-semibold text-ink">{pluralize(entry.value, 'visit')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(TrendChart);
