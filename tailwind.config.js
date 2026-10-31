/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper:  'var(--paper)',
        slip:   'var(--slip)',
        ink:    'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule:   'var(--rule)',
        stamp:  'var(--stamp)',
        paid:   'var(--paid)',
        held:   'var(--held)',
      },
      fontFamily: {
        /* Fraunces variable: display headlines */
        display:   ['"Fraunces Variable"', 'Georgia', 'serif'],
        /* Instrument Serif: /lab alt display */
        serifAlt:  ['"Instrument Serif"', 'Georgia', 'serif'],
        /* IBM Plex Sans: body copy */
        sans:      ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        /* IBM Plex Mono: labels, addresses, figures */
        mono:      ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
      },
    },
  },
  plugins: [],
}
