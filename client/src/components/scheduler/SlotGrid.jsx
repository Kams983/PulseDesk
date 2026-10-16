import { memo } from 'react';
import SlotButton from './SlotButton';
import { SLOT_STATUS, SLOT_STYLES } from '@/utils/constants';

// The grid is the same doctor's day split the way the schedule is written: a morning and an afternoon
// session with the lunch break between them. The api returns one flat list of slots, so the split is by
// clock, which keeps the grid honest even for a schedule that is not the seeded one.
const PERIODS = [
  { key: 'morning', label: 'Morning', from: 0, to: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', label: 'Evening', from: 17 * 60, to: 24 * 60 },
];

const LEGEND = [
  { status: SLOT_STATUS.AVAILABLE, text: `${SLOT_STYLES[SLOT_STATUS.AVAILABLE].label}: click to book` },
  { status: SLOT_STATUS.BOOKED, text: 'Booked: taken by a visit' },
  { status: SLOT_STATUS.PAST, text: 'Past: gone for the day' },
];

// Memoised together with the buttons: the page re-renders on every keystroke in the booking modal and on
// every refetch, and neither changes a single prop this grid is given.
function SlotGrid({ slots, bookedByStart, canBook, selectedStart, onSelect }) {
  const available = slots.filter((slot) => slot.status === SLOT_STATUS.AVAILABLE).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        {LEGEND.map(({ status, text }) => (
          <span key={status} className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-pill ${SLOT_STYLES[status].dot}`} aria-hidden="true" />
            {text}
          </span>
        ))}
        <span className="ml-auto font-semibold text-ink">
          {available} of {slots.length} free
        </span>
      </div>

      <div className="mt-5 space-y-6">
        {PERIODS.map((period) => {
          const periodSlots = slots.filter((slot) => {
            const minutes = toMinutes(slot.startTime);

            return minutes >= period.from && minutes < period.to;
          });

          if (periodSlots.length === 0) {
            return null;
          }

          return (
            <section key={period.key}>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{period.label}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {periodSlots.map((slot) => {
                  const appointment = bookedByStart.get(slot.startTime);

                  return (
                    <SlotButton
                      key={slot.startTime}
                      startTime={slot.startTime}
                      endTime={slot.endTime}
                      status={slot.status}
                      appointmentStatus={appointment ? appointment.status : undefined}
                      patientName={appointment ? appointment.patient.name : undefined}
                      canBook={canBook}
                      isSelected={selectedStart === slot.startTime}
                      onSelect={onSelect}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

export default memo(SlotGrid);
