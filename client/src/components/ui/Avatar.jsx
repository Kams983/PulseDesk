import { avatarTint, initials } from '@/utils/formatters';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

// No photographs anywhere: a clinic register is full of people who never uploaded one, and initials
// with a stable colour read as a person just as well.
export default function Avatar({ name = '', size = 'md', className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-pill font-semibold ${SIZES[size]} ${avatarTint(name)} ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
