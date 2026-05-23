import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cp: {
          bg:       "#0F0F0F",
          surface:  "#1A1A1A",
          elevated: "#222222",
          border:   "#2A2A2A",
          muted:    "#3A3A3A",
        },
      },
    },
  },
  plugins: [],
};
export default config;
