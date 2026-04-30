/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Diggy Brand — warmes Amber/Erde
        diggy: {
          50: '#FEF7EC',
          100: '#FCEAC9',
          200: '#F9D38E',
          300: '#F5B752',
          400: '#F19E2B',
          500: '#E68314',
          600: '#C8650D',
          700: '#A14A0E',
          800: '#823B12',
          900: '#6B3112',
          950: '#3D1806',
        },
        // Tiefes Petrol als Akzent
        accent: {
          50: '#EFF8F8',
          100: '#D6ECEC',
          200: '#B0DADA',
          300: '#7FBFC0',
          400: '#4F9FA1',
          500: '#3A8385',
          600: '#2F6B6E',
          700: '#2A555A',
          800: '#27464A',
          900: '#243B3F',
          950: '#11242A',
        },
        // Background-Layer für Dark Mode
        ink: {
          50: '#F8F7F4',
          100: '#EFEDE6',
          900: '#16140F',
          950: '#0B0A07',
        },
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'fade-up': 'fade-up 0.5s ease-out forwards',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
        'dig': 'dig 0.6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        dig: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
      },
    },
  },
  plugins: [],
};
