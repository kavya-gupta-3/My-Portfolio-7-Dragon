import { isTyping, toast } from './dom';

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

/** ↑↑↓↓←→←→BA unleashes Dragon Rage; developers get a note in the console. */
export function initEaster(onRage: () => void) {
  let i = 0;
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    i = k === KONAMI[i] ? i + 1 : k === KONAMI[0] ? 1 : 0;
    if (i === KONAMI.length) {
      i = 0;
      toast('DRAGON RAGE UNLEASHED', 3200);
      onRage();
    }
  });

  console.log(
    '%c KAVYA GUPTA ',
    'font:900 28px Cinzel,serif;letter-spacing:.25em;color:#fff;padding:14px 26px;background:linear-gradient(90deg,#ff2f1f,#ff9a2e,#ffc56a);text-shadow:0 2px 10px rgba(0,0,0,.45)',
  );
  console.log(
    '%cSelf-taught developer. Seven procedural dragons, custom GLSL, zero timetables.\nLooking at the source? Respect. Say hi: kavya.ugupta@gmail.com\nTry ↑↑↓↓←→←→BA on the page.',
    'font:12px monospace;color:#bbb;line-height:1.6',
  );
}
