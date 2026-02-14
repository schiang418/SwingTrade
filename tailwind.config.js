/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./client/**/*.{html,tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        'surface': {
          DEFAULT: '#0f1117',
          card: '#1a1d27',
          hover: '#242836',
        },
        'edge': '#2a2e3a',
        'dim': '#8b8fa3',
        'accent': {
          DEFAULT: '#4f8ff7',
          hover: '#3a7be0',
        },
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
