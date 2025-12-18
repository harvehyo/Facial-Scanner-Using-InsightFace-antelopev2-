/** @type {import('tailwindcss').Config} */
module.exports = {
  // The 'content' array tells Tailwind where to find your classes.
  // Adjust these paths if your file structure is different from standard.
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      scale: {
        // CRITICAL: Allows using scale-x-[-1] for the mirror effect
        '-1': '-1', 
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};