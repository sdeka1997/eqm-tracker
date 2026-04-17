/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        alaska: {
          navy: '#00426A',
          blue: '#0067C0',
          teal: '#00B2A9',
          gold: '#F5A623',
        }
      }
    }
  },
  plugins: [],
}
