import { defineConfig } from 'vite';

// App estática (HTML + app.js como módulo ES; D3 desde CDN con versión fija): Vite compila Tailwind,
// empaqueta app.js y styles.css y copia el logo. Base relativa: funciona en GitHub Pages
// (/DRP-Tabletop/) y en cualquier subcarpeta.
export default defineConfig({
  base: './',
});
