/** Keep the former CDN theme; scan only shipped UI and local QA entries. */
module.exports = {
  content: ['./index.html', './{App,RouterApp}.tsx', './components/**/*.{ts,tsx}', './tests/manual/**/*.{html,tsx}'],
  theme: {
    extend: {
      colors: {
        p2p: { blue: '#418FC5', red: '#C33934', black: '#000000', bg: '#FFFFFF',
          'light-blue': '#B4D4E9', 'light-red': '#ECBCBA' },
      },
    },
  },
};
