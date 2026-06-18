/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/lib/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter Tight", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        civic: "0 24px 80px rgba(0, 0, 0, 0.38)",
        glow: "0 0 36px rgba(20, 184, 166, 0.18)"
      }
    }
  },
  plugins: []
};
