import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        comic: {
          parchment: "#F5F0E6",
          paper: "#FDF8EF",
          aged: "#E8DCC8",
          ink: "#1A1A2E",
          "ink-soft": "#2D2D44",
          rust: "#C45D35",
          "rust-light": "#D4734F",
          "rust-dark": "#A34A28",
          navy: "#1E3A5F",
          cyan: "#3B9EBF",
          "cyan-light": "#5BBAD9",
          yellow: "#F2C94C",
          "yellow-pale": "#FFF3C4",
          sage: "#4A5D23",
          red: "#C0392B",
        },
      },
      boxShadow: {
        comic: "6px 6px 0px 0px #1A1A2E",
        "comic-lg": "8px 8px 0px 0px #1A1A2E",
        "comic-sm": "4px 4px 0px 0px #1A1A2E",
        "comic-xs": "3px 3px 0px 0px #1A1A2E",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
