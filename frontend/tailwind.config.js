/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic text ramp driven by CSS variables, so the whole app can be
        // re-skinned (dark <-> light) without touching a single component.
        1: 'rgb(var(--text-1) / <alpha-value>)',
        2: 'rgb(var(--text-2) / <alpha-value>)',
        3: 'rgb(var(--text-3) / <alpha-value>)',
        ink: {
          950: '#05050a',
          900: '#08080f',
          850: '#0b0b15',
          800: '#10101d',
          750: '#151524',
          700: '#1b1b2e',
          600: '#24243c',
          500: '#33334f',
        },
        brand: {
          50: '#f2f0ff',
          100: '#e6e1ff',
          200: '#cec5ff',
          300: '#ab9dff',
          400: '#8b74ff',
          500: '#7450f5',
          600: '#6135e0',
          700: '#4f28ba',
          800: '#402395',
          900: '#352079',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,116,255,0.28), 0 18px 60px -18px rgba(116,80,245,0.55)',
        card: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 20px 50px -30px rgba(0,0,0,0.9)',
        lift: '0 30px 70px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.07)',
        ring: '0 0 0 1px rgba(255,255,255,0.08), 0 0 0 4px rgba(116,80,245,0.18)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px)',
        'brand-gradient': 'linear-gradient(120deg, #8b74ff 0%, #6135e0 45%, #22d3ee 100%)',
        'brand-gradient-soft':
          'linear-gradient(120deg, rgba(139,116,255,0.18) 0%, rgba(97,53,224,0.14) 45%, rgba(34,211,238,0.14) 100%)',
      },
      backgroundSize: { grid: '44px 44px' },
      keyframes: {
        'aurora-drift': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%, -4%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-5%, 5%, 0) scale(0.95)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        aurora: 'aurora-drift 26s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        marquee: 'marquee 38s linear infinite',
      },
    },
  },
  plugins: [],
}
