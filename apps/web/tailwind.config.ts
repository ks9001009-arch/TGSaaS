import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Telegram-desktop inspired palette
        tg: {
          blue: '#2ea6ff',
          blueDark: '#1c93e3',
          bg: '#0e1621',
          panel: '#17212b',
          panel2: '#1d2733',
          border: '#101921',
          text: '#e8edf2',
          muted: '#7d8e9c',
          green: '#4dcb5d',
          red: '#e5556a',
          amber: '#f0b232',
        },
      },
      borderRadius: {
        xl: '14px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
