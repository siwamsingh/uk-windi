/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(20, 33, 61, 0.035), 0 1px 2px rgba(20, 33, 61, 0.025)',
      },
      colors: {
        ink: '#172438',
        muted: '#758399',
        line: '#e6ebf2',
        bluebrand: '#3679e8',
        greenbrand: '#10a978',
      },
    },
  },
  plugins: [],
}
