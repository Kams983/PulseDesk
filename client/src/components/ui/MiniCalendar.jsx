import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, isSameMonth, monthLabel, monthMatrix, toDate, weekdayLabels } from '@/utils/dateUtils';

// Plain date maths, no calendar library. today is the server's calendar date and is highlighted
// separately from the selection, because "the day it is" and "the day you picked" are two facts.
//
// A day that holds appointments carries a dot under its number rather than a colour of its own: the
// number stays the way every other number looks, and the dot is the one thing that is about the clinic
// rather than about the calendar.
export default function MiniCalendar({ selectedDate, today, minDate, counts = {}, onSelect, className = '' }) {
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
          const booked = counts[iso] || 0;
          // a dot in the padding of a neighbouring month would point at a day the grid is not showing
          const hasAppointments = booked > 0 && !isOutside;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              disabled={isDisabled}
              aria-label={`${toDate(iso).toUTCString().slice(0, 16)}${hasAppointments ? `, ${booked} booked` : ''}`}
              aria-current={isToday ? 'date' : undefined}
              className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-control text-sm transition disabled:cursor-not-allowed disabled:text-ink-muted/40 ${
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

              {/* the row is there whether or not the day is booked, so every number sits on the same line */}
              <span
                className={`h-1.5 w-1.5 rounded-pill ${
                  hasAppointments ? (isSelected ? 'bg-white' : 'bg-primary') : 'bg-transparent'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-pill bg-primary" aria-hidden="true" />
        Has appointments
      </p>
    </div>
  );
}
