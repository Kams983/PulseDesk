import { STATUS_STYLES } from '@/utils/constants';

// status is one of the four appointment states; the colours come from the one mapping in constants so a
// status cannot be blue on one screen and green on another.
export default function Badge({ status, className = '' }) {
  const style = STATUS_STYLES[status];

  if (!style) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${style.tint} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}
