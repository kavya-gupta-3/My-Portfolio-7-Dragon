import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './styles/main.css';

import { boot } from './app';

document.documentElement.classList.replace('no-js', 'js');
void boot();

// installable + works offline (production only; dev keeps HMR clean)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
