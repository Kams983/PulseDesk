import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, isSameMonth, monthLabel, monthMatrix, toDate, weekdayLabels } from '@/utils/dateUtils';

// Plain date maths, no calendar library. today is the server's calendar date and is highlighted
// separately from the selection, because "the day it is" and "the day you picked" are two facts.
export default function MiniCalendar({ selectedDate, today, minDate, onSelect, className = '' }) {
  const [month, setMonth] = useState(selectedDate || today);
  const weeks = monthMatrix(month);

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
          className="rounded-pill p-1.5 text-ink-muted transition hover:bg-page hover:text-ink"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-ink">{monthLabel(month)}</p>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
          className="rounded-pill p-1.5 text-ink-muted transition hover:bg-page hover:text-ink"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-muted">
        {weekdayLabels().map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((iso) => {
          const isSelected = iso === selectedDate;
          const isToday = iso === today;
          const isDisabled = Boolean(minDate) && iso < minDate;
          const isOutside = !isSameMonth(iso, month);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              disabled={isDisabled}
              aria-label={toDate(iso).toUTCString().slice(0, 16)}
              aria-current={isToday ? 'date' : undefined}
              className={`flex h-9 items-center justify-center rounded-pill text-sm transition disabled:cursor-not-allowed disabled:text-ink-muted/40 ${
                isSelected
                  ? 'bg-primary font-semibold text-white'
                  : isToday
                    ? 'bg-primary-tint font-semibold text-primary'
                    : isOutside
                      ? 'text-ink-muted/50 hover:bg-page'
                      : 'text-ink hover:bg-page'
              }`}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
