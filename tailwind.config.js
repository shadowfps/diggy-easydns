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
        // Brand-Wordmark — Goldman von Google Fonts
        brand: ['Goldman', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Diggy Brand — Vivid Violet (Hauptton: #920FED)
        // Skala um die 500 herum gleicher Hue, gestaffelte Lightness.
        diggy: {
          50: '#FAF1FE',
          100: '#F3DEFD',
          200: '#E8BCFB',
          300: '#D88FF8',
          400: '#C161F4',
          500: '#920FED',
          600: '#7C0DC9',
          700: '#640AA1',
          800: '#4F087E',
          900: '#3B065C',
          950: '#26033B',
        },
        // Komplementäres Sage/Mint als Akzent (statt Petrol — passt besser zu Plum)
        accent: {
          50: '#EEF5F0',
          100: '#D9E8DD',
          200: '#B5D3BD',
          300: '#8AB597',
          400: '#629578',
          500: '#4A7B5F',
          600: '#3B634C',
          700: '#314F3D',
          800: '#294233',
          900: '#23362B',
          950: '#101D16',
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
