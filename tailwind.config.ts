import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#05070D',
          900: '#090D16',
          850: '#0A0F1A',
          800: '#0D1117',
          700: '#141B26',
        },
        cyber: {
          cyan: '#00F2FE',
          teal: '#22D3EE',
          emerald: '#10B981',
          violet: '#A855F7',
          rose: '#F43F5E',
          amber: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 30px -8px rgba(0, 242, 254, 0.55)',
        'glow-emerald': '0 0 30px -8px rgba(16, 185, 129, 0.5)',
        'glow-violet': '0 0 30px -8px rgba(168, 85, 247, 0.45)',
        panel: '0 24px 60px -32px rgba(0, 0, 0, 0.9)',
      },
      animation: {
        'pulse-slow': 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 9s linear infinite',
        'sweep': 'sweep 2.8s ease-in-out infinite',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        sweep: {
          '0%, 100%': { transform: 'translateX(-120%)' },
          '50%': { transform: 'translateX(120%)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
