const { heroui } = require('@heroui/react');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
        },
      },
      boxShadow: {
        glass:
          '0 8px 30px -12px rgba(15, 23, 42, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)',
        'glass-lg':
          '0 16px 50px -12px rgba(15, 23, 42, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.65)',
      },
    },
  },
  darkMode: 'class',
  plugins: [
    heroui({
      layout: {
        radius: { small: '8px', medium: '12px', large: '16px' },
      },
      themes: {
        light: {
          colors: {
            // Indigo / violet primary ramp
            primary: {
              50: '#eef2ff',
              100: '#e0e7ff',
              200: '#c7d2fe',
              300: '#a5b4fc',
              400: '#818cf8',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
              800: '#3730a3',
              900: '#312e81',
              DEFAULT: '#6366f1',
              foreground: '#ffffff',
            },
            // Translucent content surfaces so HeroUI Card / Modal / Popover /
            // Select listbox / Table wrapper all read as frosted glass
            content1: { DEFAULT: 'rgba(255, 255, 255, 0.65)', foreground: '#1e293b' },
            content2: { DEFAULT: 'rgba(255, 255, 255, 0.5)', foreground: '#1e293b' },
            content3: { DEFAULT: 'rgba(255, 255, 255, 0.4)', foreground: '#1e293b' },
            content4: { DEFAULT: 'rgba(255, 255, 255, 0.3)', foreground: '#1e293b' },
          },
        },
      },
    }),
  ],
};
