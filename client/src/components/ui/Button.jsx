import { PulseMark } from './PulseMark';

// one primary action per screen; the other variants are for everything that must not compete with it
const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-primary-tint text-primary hover:bg-primary-tint/70',
  ghost: 'text-ink-muted hover:bg-page hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
};

const SIZES = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-2.5 text-sm',
};

// loading disables the button itself, so a double click cannot send the same request twice. The mark
// draws in the button's own text colour, so it reads on the filled and the tinted variants alike.
export default function Button({ variant = 'primary', size = 'md', loading = false, type = 'button', className = '', children, ...props }) {
  return (
    <button
      {...props}
      type={type}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <PulseMark size={size === 'sm' ? 13 : 16} /> : null}
      {children}
    </button>
  );
}
