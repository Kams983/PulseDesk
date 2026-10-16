import { memo } from 'react';
import { Lock } from 'lucide-react';
import { SLOT_STATUS, SLOT_STYLES, STATUS_STYLES } from '@/utils/constants';
import { formatTime } from '@/utils/formatters';

// Memoised, and every prop it takes is a primitive or a stable function on purpose. A refetch hands the
// grid a brand new array of slot objects, and if this button received the object itself it would compare
// unequal and redraw all of them; with strings and booleans React.memo can tell that one slot changed
// and leave the other forty alone. That only pays off because onSelect is a useCallback in the page.
function SlotButton({ startTime, endTime, status, appointmentStatus, patientName, canBook, isSelected, onSelect }) {
  const style = SLOT_STYLES[status] || SLOT_STYLES[SLOT_STATUS.AVAILABLE];
  const isBooked = status === SLOT_STATUS.BOOKED;
  const isAvailable = status === SLOT_STATUS.AVAILABLE;
  const canClick = isAvailable && canBook;

  // A booked visit is tinted by its own status, so a board of booked slots reads as scheduled, arrived
  // and completed at a glance rather than as forty identical grey boxes.
  const bookedTone = isBooked && appointmentStatus ? STATUS_STYLES[appointmentStatus] : null;
  const bookedClass = bookedTone ? `border-transparent ${bookedTone.tint} ${bookedTone.text}` : style.button;

  return (
    <button
      type="button"
      // the whole point of the board: a booked or past slot is not a button that happens to be disabled,
      // it is not a choice at all
      disabled={!canClick}
      onClick={canClick ? () => onSelect(startTime) : undefined}
      aria-label={`${formatTime(startTime)} ${formatTime(endTime)} ${style.label}${patientName ? `, ${patientName}` : ''}`}
      title={patientName ? `${formatTime(startTime)} – ${patientName}` : `${formatTime(startTime)} – ${formatTime(endTime)}`}
      className={`flex w-full flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left transition ${
        isBooked ? bookedClass : style.button
      } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-page' : ''}`}
    >
      <span className="text-sm font-semibold">{formatTime(startTime)}</span>

      {isBooked ? (
        // the patient name is what turns a full board into a useful one for the doctor reading it, and
        // it is only ever shown from an appointment the api already allowed this user to read
        <span className="flex w-full items-center gap-1 text-xs">
          {patientName ? (
            <span className="truncate opacity-80">{patientName}</span>
          ) : (
            <span className="inline-flex items-center gap-1 opacity-80">
              <Lock size={11} aria-hidden="true" />
              Booked
            </span>
          )}
        </span>
      ) : (
        <span className="text-xs opacity-70">{formatTime(endTime)}</span>
      )}
    </button>
  );
}

export default memo(SlotButton);
