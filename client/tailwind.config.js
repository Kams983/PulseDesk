// The one place a colour, radius or shadow is defined. A component that needs a new one adds it here
// first, so two screens can never drift into two slightly different indigos.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#EEF0FB',
        card: '#FFFFFF',
        primary: {
          DEFAULT: '#4B4FB5',
          hover: '#3F43A0',
          tint: '#E4E6FB',
        },
        ink: {
          DEFAULT: '#1F2150',
          // Dark enough to pass 4.5:1 on both the card and the page behind it at 12px: the lighter grey
          // this used to be only reached 4.3:1 on the page, which is under the line for body size text.
          muted: '#5F6382',
        },
        line: '#E3E5F2',
        // one pair per appointment status: text on tint, reused by badges, slots and the chart
        scheduled: { DEFAULT: '#2B5BD7', tint: '#E3EBFD' },
        arrived: { DEFAULT: '#B26A00', tint: '#FDF0DC' },
        completed: { DEFAULT: '#1F7A4C', tint: '#E1F5EA' },
        cancelled: { DEFAULT: '#5F6382', tint: '#ECEDF4' },
        danger: { DEFAULT: '#B3261E', tint: '#FCE8E6' },
      },
      borderRadius: {
        control: '0.75rem',
        card: '1rem',
        panel: '1.5rem',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 10px 30px -22px rgba(31, 33, 80, 0.45)',
        rail: '0 18px 40px -26px rgba(31, 33, 80, 0.55)',
        pop: '0 14px 34px -18px rgba(31, 33, 80, 0.35)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      // The one loader in the product. Every piece derives from the same four moves: a ring that
      // sweeps, a pulse that breathes, a trace that travels and a ping that widens. Keeping them in the
      // theme means the sign in button, the boot screen and the reconnecting pill are visibly the same
      // object at three sizes instead of three unrelated spinners.
      keyframes: {
        'astra-sweep': { to: { transform: 'rotate(360deg)' } },
        'astra-orbit': { to: { transform: 'rotate(-360deg)' } },
        'astra-breathe': {
          '0%, 100%': { transform: 'scale(0.9)', opacity: '0.85' },
          '50%': { transform: 'scale(1.08)', opacity: '1' },
        },
        'astra-ping': {
          '0%': { transform: 'scale(0.35)', opacity: '0.4' },
          '70%, 100%': { transform: 'scale(2.7)', opacity: '0' },
        },
        'astra-trace': {
          from: { strokeDashoffset: '100' },
          to: { strokeDashoffset: '0' },
        },
        'astra-shimmer': {
          from: { transform: 'translateX(-120%)' },
          to: { transform: 'translateX(320%)' },
        },
        'astra-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'astra-sweep': 'astra-sweep 2.8s linear infinite',
        'astra-orbit': 'astra-orbit 7s linear infinite',
        'astra-breathe': 'astra-breathe 2.8s ease-in-out infinite',
        'astra-ping': 'astra-ping 2.8s cubic-bezier(0, 0, 0.2, 1) infinite',
        'astra-trace': 'astra-trace 2.8s cubic-bezier(0.55, 0.05, 0.35, 0.95) infinite',
        'astra-shimmer': 'astra-shimmer 2s ease-in-out infinite',
        'astra-rise': 'astra-rise 0.45s ease-out both',
      },
    },
  },
  plugins: [],
};
