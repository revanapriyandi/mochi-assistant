// Mochi, the 2D cat avatar: a chubby white kitten with orange patches, big glossy eyes and a pink nose,
// drawn as one inline SVG. CSS (app.css, "Mochi") does posture per mood/state: ears, head tilt, tail,
// breathing, brows, ^^ eyes, Zzz. This file adds what CSS can't: eyes that follow the pointer,
// irregular blinks, lip sync from the voice level, a hop when woken, and petting by stroking.
import type { Mood } from '../types.ts';

export type CatState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'sleeping';
export interface Cat {
  setMood(m: Mood): void;
  setState(s: CatState): void;
  setVoiceLevel(level: number): void;
  wake(): void;
}

const heart = (x: number, y: number, s: number) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -2C-5 -9 -14 -3 0 9C14 -3 5 -9 0 -2Z"/>`;

const SVG = `
<svg class="mochi" viewBox="0 0 400 400" aria-hidden="true" data-mood="neutral" data-state="idle">
  <defs>
    <radialGradient id="m-fur" cx="45%" cy="35%" r="70%">
      <stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#fbf6ef"/><stop offset="1" stop-color="#ecdfcd"/>
    </radialGradient>
    <radialGradient id="m-iris" cx="50%" cy="75%" r="65%">
      <stop offset="0" stop-color="#8a5532"/><stop offset=".55" stop-color="#3a241a"/><stop offset="1" stop-color="#1e130e"/>
    </radialGradient>
    <clipPath id="m-head"><ellipse cx="200" cy="192" rx="138" ry="110"/></clipPath>
    <clipPath id="m-body"><ellipse cx="200" cy="318" rx="104" ry="60"/></clipPath>
  </defs>
  <ellipse class="shadow" cx="200" cy="378" rx="112" ry="11"/>
  <g class="tail">
    <path class="tail-line" d="M282 345C352 350 378 300 352 248"/>
    <path class="tail-fur" d="M282 345C352 350 378 300 352 248"/>
    <path class="tail-tip" d="M363 282C361 266 357 256 352 248"/>
  </g>
  <g class="body">
    <ellipse class="fur" cx="200" cy="318" rx="104" ry="60"/>
    <ellipse class="patch" cx="126" cy="292" rx="42" ry="32" clip-path="url(#m-body)"/>
    <ellipse class="outline" cx="200" cy="318" rx="104" ry="60"/>
    <ellipse class="fur paw" cx="162" cy="364" rx="27" ry="16"/>
    <ellipse class="fur paw" cx="238" cy="364" rx="27" ry="16"/>
    <path class="toes" d="M154 360v10M170 360v10M230 360v10M246 360v10"/>
  </g>
  <g class="head">
    <g class="ear l"><path class="ear-out" d="M86 132Q78 50 102 38Q124 36 172 86Z"/><path class="ear-in" d="M104 114Q100 66 112 58Q124 60 150 92Z"/></g>
    <g class="ear r"><path class="ear-out" d="M314 132Q322 50 298 38Q276 36 228 86Z"/><path class="ear-in" d="M296 114Q300 66 288 58Q276 60 250 92Z"/></g>
    <ellipse class="fur" cx="200" cy="192" rx="138" ry="110"/>
    <g class="patch" clip-path="url(#m-head)">
      <path d="M146 84Q200 58 254 84Q266 122 224 134Q211 162 206 216H194Q189 162 176 134Q134 122 146 84Z"/>
      <ellipse cx="302" cy="110" rx="58" ry="44"/>
    </g>
    <ellipse class="outline" cx="200" cy="192" rx="138" ry="110"/>
    <ellipse class="blush" cx="110" cy="240" rx="22" ry="12"/>
    <ellipse class="blush" cx="290" cy="240" rx="22" ry="12"/>
    <path class="brow l" d="M122 150H166"/><path class="brow r" d="M234 150H278"/>
    <g class="eye-open l">
      <ellipse cx="145" cy="198" rx="31" ry="36" fill="#24170f"/>
      <ellipse cx="145" cy="204" rx="25" ry="28" fill="url(#m-iris)"/>
      <circle cx="133" cy="184" r="11" fill="#fff"/><circle cx="156" cy="213" r="4.5" fill="#fff" opacity=".9"/><circle cx="154" cy="180" r="3" fill="#fff" opacity=".8"/>
    </g>
    <g class="eye-open r">
      <ellipse cx="255" cy="198" rx="31" ry="36" fill="#24170f"/>
      <ellipse cx="255" cy="204" rx="25" ry="28" fill="url(#m-iris)"/>
      <circle cx="243" cy="184" r="11" fill="#fff"/><circle cx="266" cy="213" r="4.5" fill="#fff" opacity=".9"/><circle cx="264" cy="180" r="3" fill="#fff" opacity=".8"/>
    </g>
    <path class="eye-happy" d="M119 208Q145 174 171 208M229 208Q255 174 281 208"/>
    <path class="eye-sleep" d="M119 196Q145 222 171 196M229 196Q255 222 281 196"/>
    <g class="whiskers l"><path d="M96 230L40 220M96 242L34 244M98 254L42 266"/></g>
    <g class="whiskers r"><path d="M304 230L360 220M304 242L366 244M302 254L358 266"/></g>
    <g class="mouth-open"><ellipse cx="200" cy="259" rx="13" ry="12" fill="#7d2b39"/><ellipse cx="200" cy="266" rx="8" ry="5" fill="#f2899a"/></g>
    <path class="nose" d="M188 229Q200 223 212 229Q208 240 200 242Q192 240 188 229Z"/>
    <path class="mouth w" d="M200 242V248M181 247Q190 259 200 248Q210 259 219 247"/>
    <path class="mouth sad" d="M200 242V248M186 258Q193 250 200 256Q207 250 214 258"/>
    <path class="fx sweat" d="M280 116q11 15 0 24q-11-9 0-24Z"/>
  </g>
  <g class="fx zzz"><text x="292" y="96">z</text><text x="314" y="72">Z</text><text x="342" y="44">Z</text></g>
  <g class="fx think"><circle cx="300" cy="86" r="6"/><circle cx="322" cy="62" r="9"/><circle cx="352" cy="36" r="13"/></g>
  <text class="fx question" x="322" y="98">?</text>
  <g class="fx waves"><path d="M332 108q14 16 0 32"/><path d="M350 96q24 28 0 56"/></g>
  <g class="fx hearts">${heart(316, 92, 1.7)}${heart(84, 80, 1.2)}${heart(346, 52, 1)}</g>
</svg>`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createCat(el: HTMLElement): Cat {
  el.insertAdjacentHTML('afterbegin', SVG);
  const svg = el.querySelector<SVGSVGElement>('svg.mochi')!;
  let state: CatState = 'idle';
  let level = 0, levelAt = 0, open = 0;
  let look = { x: 0, y: 0 }, lookAt = -1e4, glance = { x: 0, y: 0 }, gx = 0, gy = 0;
  let petted = false, petTimer = 0, pressed = false, stroke = 0;

  const flash = (cls: string, ms: number) => {
    svg.classList.remove(cls);
    void svg.getBoundingClientRect(); // restart the CSS animation
    svg.classList.add(cls);
    setTimeout(() => svg.classList.remove(cls), ms);
  };

  // Irregular blinks, sometimes a double blink.
  const blink = () => {
    if (state !== 'sleeping' && !petted) {
      flash('blink', 120);
      if (Math.random() < 0.2) setTimeout(() => flash('blink', 110), 240);
    }
    setTimeout(blink, rand(2200, 6000));
  };
  setTimeout(blink, 1500);
  setInterval(() => { glance = Math.random() < 0.4 ? { x: 0, y: 0 } : { x: rand(-5, 5), y: rand(-3, 3) }; }, 2600);

  // Eyes follow the pointer anywhere on the page; dragging across Mochi pets it.
  addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    look = { x: clamp(((e.clientX - r.left) / r.width - 0.5) * 16, -6, 6), y: clamp(((e.clientY - r.top) / r.height - 0.5) * 14, -5, 5) };
    lookAt = performance.now();
    if (pressed && (stroke += Math.hypot(e.movementX, e.movementY)) > 80) pet();
  });
  el.addEventListener('pointerdown', () => { pressed = true; stroke = 0; });
  addEventListener('pointerup', () => { pressed = false; });
  // A stroke is petting, not a tap: keep it from starting/stopping the conversation.
  el.addEventListener('click', (e) => { if (stroke > 80) { stroke = 0; e.stopImmediatePropagation(); } }, true);

  function pet() {
    petted = true;
    svg.dataset.petted = '';
    clearTimeout(petTimer);
    petTimer = setTimeout(() => { petted = false; delete svg.dataset.petted; }, 1600);
  }

  const frame = (t: number) => {
    if (t - levelAt > 160) level = 0;
    open += ((state === 'speaking' ? level : 0) - open) * 0.35;
    const g = state === 'thinking' ? { x: 5, y: -6 }
      : state === 'sleeping' || petted ? { x: 0, y: 0 }
      : t - lookAt < 2500 ? look : glance;
    gx += (g.x - gx) * 0.15; gy += (g.y - gy) * 0.15;
    svg.style.setProperty('--open', open.toFixed(3));
    svg.style.setProperty('--lx', gx.toFixed(2));
    svg.style.setProperty('--ly', gy.toFixed(2));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    setMood: (m) => { svg.dataset.mood = m; },
    setState: (s) => { state = s; svg.dataset.state = s; },
    setVoiceLevel: (l) => { level = Math.min(1, l); levelAt = performance.now(); },
    wake: () => flash('wake', 600),
  };
}
