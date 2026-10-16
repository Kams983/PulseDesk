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
    },
  },
  plugins: [],
};
