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
import { TREND_SERIES } from '@/utils/constants';

// The chart reads the trend endpoint, one point per day ending today. Colours and series names come
// from the shared constants, so the same series cannot be green here and teal on the list page.
function TrendChart({ data = [] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {TREND_SERIES.map((series) => (
              <linearGradient key={series.key} id={`trend-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke="#E3E5F2" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => formatDate(date, { weekday: 'short' })}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#6B6F8F' }}
            dy={6}
          />
          {/* integers only: a count of 0.5 of an appointment is meaningless on a gridline */}
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6B6F8F' }} width={48} />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#E3E5F2' }} />

          {TREND_SERIES.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              fill={`url(#trend-${series.key})`}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
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
