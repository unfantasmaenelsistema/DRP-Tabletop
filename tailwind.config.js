/** Misma configuración que usaba el CDN de Tailwind 3: el aspecto no cambia. */
export default {
  content: ['./index.html', './app.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        soc: {
          canvas: '#070B14',
          surface: '#0E1525',
          elevated: '#131C31',
          terminal: '#050810',
          border: '#1E293B',
        },
      },
    },
  },
};
