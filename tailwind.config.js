/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          dark: '#2C2F33',
          darker: '#23272A',
          light: '#99AAB5',
          blurple: '#7289DA',
          green: '#43B581',
          red: '#F04747'
        },
        surface: '#0B0F14',
        'surface-2': '#0E131A',
        border: '#1B212B',
        muted: '#8792A2',
        accent: '#22D3EE'
      }
    },
  },
  plugins: [],
}
