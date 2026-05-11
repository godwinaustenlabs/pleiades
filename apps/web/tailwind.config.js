/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F172A', // Slate 900
        surface: '#1E293B',    // Slate 800
        primary: '#38BDF8',    // Light Blue
        accent: '#818CF8',     // Indigo 400
        textPrimary: '#F8FAFC',// Slate 50
        textSecondary: '#94A3B8' // Slate 400
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
