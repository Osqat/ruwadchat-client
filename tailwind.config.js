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
        }
      }
    },
  },
  plugins: [],
}
