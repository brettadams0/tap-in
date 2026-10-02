/** Bottle-cap avatar (DESIGN.md §11). Static, trusted SVG fragments only: no user input reaches innerHTML. */
import { useId } from 'react';
import { colorHex, type Avatar } from '@tap-in/shared';

const INK = '#15100D';
const FOAM = '#F7ECD8';

function crimp(r1: number, r2: number, n: number): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  }
  return `${d}Z`;
}
const CRIMP = crimp(30, 26.5, 21);

const star = (cx: number, cy: number, r: number): string => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  }
  return `${d}Z`;
};

const EYES: Record<Avatar['eyes'], string> = {
  dots: '<circle cx="-9" cy="-5" r="3.4"/><circle cx="9" cy="-5" r="3.4"/>',
  hearts:
    '<path d="M-9 -1.5l-4.6-4.6a2.7 2.7 0 0 1 4.6-3.1a2.7 2.7 0 0 1 4.6 3.1zM9 -1.5l-4.6-4.6a2.7 2.7 0 0 1 4.6-3.1a2.7 2.7 0 0 1 4.6 3.1z"/>',
  stars: `<path d="${star(-9, -5, 5)}${star(9, -5, 5)}"/>`,
  wink: '<path d="M-13 -5h8" stroke-width="3.4" stroke-linecap="round" fill="none"/><circle cx="9" cy="-5" r="3.4"/>',
  sleepy:
    '<path d="M-13 -4q4 4 8 0M5 -4q4 4 8 0" fill="none" stroke-width="3" stroke-linecap="round"/>',
  shades: '<path d="M-16 -9h32v4q-4 7-11 0h-10q-7 7-11 0z"/>',
  spiral:
    '<path d="M-13 -9l7 7M-6 -9l-7 7M6 -9l7 7M13 -9l-7 7" fill="none" stroke-width="2.8" stroke-linecap="round"/>',
  side: `<circle cx="-9" cy="-5" r="4.6" fill="${FOAM}" stroke-width="2"/><circle cx="9" cy="-5" r="4.6" fill="${FOAM}" stroke-width="2"/><circle cx="-6.5" cy="-5" r="2.2"/><circle cx="11.5" cy="-5" r="2.2"/>`,
  sparkle: `<circle cx="-9" cy="-5" r="4.2"/><circle cx="9" cy="-5" r="4.2"/><circle cx="-7.6" cy="-6.6" r="1.4" fill="${FOAM}" stroke="none"/><circle cx="10.4" cy="-6.6" r="1.4" fill="${FOAM}" stroke="none"/>`,
  anime: `<ellipse cx="-9" cy="-5" rx="4.4" ry="5.6"/><ellipse cx="9" cy="-5" rx="4.4" ry="5.6"/><circle cx="-7.6" cy="-7" r="1.8" fill="${FOAM}" stroke="none"/><circle cx="10.4" cy="-7" r="1.8" fill="${FOAM}" stroke="none"/>`,
};

const MOUTHS: Record<Avatar['mouth'], string> = {
  grin: '<path d="M-11 5Q0 16 11 5" fill="none" stroke-width="3.4" stroke-linecap="round"/>',
  smirk: '<path d="M-8 8Q4 10 11 3" fill="none" stroke-width="3.4" stroke-linecap="round"/>',
  tongue: '<path d="M-10 4Q0 14 10 4z"/><path d="M-3 9q3 7 6 0" fill="#FF5FA8" stroke-width="2"/>',
  o: '<ellipse cx="0" cy="9" rx="4" ry="5"/>',
  fangs: `<path d="M-10 5h20" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M-6 5l2 5 2-5M2 5l2 5 2-5" fill="${FOAM}" stroke-width="1.6"/>`,
  whistle: '<circle cx="2" cy="9" r="3.2" fill="none" stroke-width="2.8"/>',
  wobbly:
    '<path d="M-10 9q2.5-4 5 0t5 0 5 0 5 0" fill="none" stroke-width="3" stroke-linecap="round"/>',
  toothy: `<path d="M-10 4h20q-2 9-10 9t-10-9z"/><path d="M-6 4.5h12v3h-12z" fill="${FOAM}" stroke="none"/>`,
  cat: '<path d="M-9 6q4.5 5 9 0q4.5 5 9 0" fill="none" stroke-width="3" stroke-linecap="round"/>',
  kiss: '<path d="M-2 4q5 2 0 5q5 2 0 5" fill="none" stroke-width="3" stroke-linecap="round"/>',
};

const PATTERNS: Record<Avatar['pattern'], string> = {
  solid: '',
  stripes: `<g stroke="${INK}" stroke-opacity=".16" stroke-width="5">${[-30, -18, -6, 6, 18, 30]
    .map((x) => `<line x1="${x}" y1="-34" x2="${x + 20}" y2="34"/>`)
    .join('')}</g>`,
  polka: `<g fill="${INK}" fill-opacity=".15">${[
    [-16, -16],
    [0, -22],
    [16, -16],
    [-22, 0],
    [22, 0],
    [-16, 16],
    [0, 22],
    [16, 16],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`)
    .join('')}</g>`,
  checker: `<g fill="${INK}" fill-opacity=".14">${Array.from({ length: 49 }, (_, i) => {
    const x = i % 7;
    const y = Math.floor(i / 7);
    return (x + y) % 2
      ? ''
      : `<rect x="${-35 + x * 10}" y="${-35 + y * 10}" width="10" height="10"/>`;
  }).join('')}</g>`,
  starburst: `<path d="${star(0, 0, 40)}" fill="${INK}" fill-opacity=".13"/>`,
  swirl: `<path d="M0 0m-24 0a24 24 0 1 1 48 0a18 18 0 1 1-36 0a12 12 0 1 1 24 0a6 6 0 1 1-12 0" fill="none" stroke="${INK}" stroke-opacity=".15" stroke-width="5"/>`,
  split: `<path d="M-34 -34L34 34L34 -34Z" fill="${INK}" fill-opacity=".16"/>`,
  sunrays: `<g fill="${INK}" fill-opacity=".14">${Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const b = a + Math.PI / 14;
    return `<path d="M0 0L${(Math.cos(a) * 34).toFixed(1)} ${(Math.sin(a) * 34).toFixed(1)}L${(Math.cos(b) * 34).toFixed(1)} ${(Math.sin(b) * 34).toFixed(1)}Z"/>`;
  }).join('')}</g>`,
};

const TOPPERS: Record<Avatar['topper'], string> = {
  none: '',
  party: `<path d="M-12 -27L0 -56L12 -27Z" fill="#FFEE55" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M-7 -38l11-5M-4 -46l7-3" stroke="#FF5FA8" stroke-width="3"/><circle cx="0" cy="-57" r="4.5" fill="#FF5FA8" stroke="${INK}" stroke-width="2.5"/>`,
  crown: `<path d="M-17 -27L-19 -47L-9 -37L0 -50L9 -37L19 -47L17 -27Z" fill="#FFB81C" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  cowboy: `<path d="M-30 -27q30 10 60 0q-6 6-14 6h-32q-8 0-14-6z" fill="#B9773E" stroke="${INK}" stroke-width="2.6"/><path d="M-14 -28q2-18 14-16q12-2 14 16z" fill="#B9773E" stroke="${INK}" stroke-width="2.6"/>`,
  beanie: `<path d="M-20 -24q0-22 20-22t20 22z" fill="#6EC3FF" stroke="${INK}" stroke-width="2.6"/><rect x="-22" y="-28" width="44" height="7" rx="3" fill="#F7ECD8" stroke="${INK}" stroke-width="2.4"/><circle cx="0" cy="-48" r="5" fill="#F7ECD8" stroke="${INK}" stroke-width="2.4"/>`,
  flower: `<g transform="translate(16 -26)" stroke="${INK}" stroke-width="2">${[
    0, 72, 144, 216, 288,
  ]
    .map(
      (d) =>
        `<circle cx="${(Math.cos((d * Math.PI) / 180) * 6).toFixed(1)}" cy="${(Math.sin((d * Math.PI) / 180) * 6).toFixed(1)}" r="5" fill="#FFA6D2"/>`,
    )
    .join('')}<circle r="4" fill="#FFEE55"/></g>`,
  horns: `<path d="M-18 -24q-8-14-2-24q3 12 12 18zM18 -24q8-14 2-24q-3 12-12 18z" fill="#FF4D3D" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
  halo: '<ellipse cx="0" cy="-42" rx="17" ry="5.5" fill="none" stroke="#FFEE55" stroke-width="4.5"/>',
  headphones: `<path d="M-27 -6q0-34 27-34t27 34" fill="none" stroke="${INK}" stroke-width="4"/><rect x="-33" y="-12" width="10" height="16" rx="4" fill="#FF4D3D" stroke="${INK}" stroke-width="2.4"/><rect x="23" y="-12" width="10" height="16" rx="4" fill="#FF4D3D" stroke="${INK}" stroke-width="2.4"/>`,
  bow: `<path d="M0 -30l-14-8v16zM0 -30l14-8v16z" fill="#FF5FA8" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="0" cy="-30" r="4" fill="#FF5FA8" stroke="${INK}" stroke-width="2.4"/>`,
  chef: `<path d="M-14 -26v-8q-10-2-8-11t12-5q4-9 10-9t10 9q10-4 12 5t-8 11v8z" fill="#F7ECD8" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  umbrella: `<g transform="translate(15 -30) rotate(16) scale(1.35)"><path d="M0 1v-13" stroke="${INK}" stroke-width="2"/><path d="M-13 -11q13-15 26 0z" fill="#5FE0B7" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M-6 1l2 11h8l2-11z" fill="#FFB81C" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`,
};

export interface CapProps {
  avatar: Avatar;
  size?: number;
  /** Accessible name, usually the player's name. */
  label?: string;
  className?: string;
  /** Greyed for reconnecting/gone players (always paired with a text badge). */
  dim?: boolean;
}

export function Cap({ avatar, size = 64, label, className, dim }: CapProps) {
  const clip = useId();
  return (
    <svg
      width={size}
      height={size * 1.36}
      viewBox="-36 -62 72 98"
      role="img"
      aria-label={label ?? 'cap'}
      className={className}
      style={dim ? { filter: 'grayscale(1)', opacity: 0.5 } : undefined}
    >
      <defs>
        <clipPath id={clip}>
          <circle r="27" />
        </clipPath>
      </defs>
      <path
        d={CRIMP}
        fill={colorHex(avatar.color)}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g
        clipPath={`url(#${clip})`}
        dangerouslySetInnerHTML={{ __html: PATTERNS[avatar.pattern] }}
      />
      <circle r="21" fill="none" stroke={INK} strokeOpacity=".22" strokeWidth="2.5" />
      <g
        fill={INK}
        stroke={INK}
        dangerouslySetInnerHTML={{ __html: EYES[avatar.eyes] + MOUTHS[avatar.mouth] }}
      />
      <g dangerouslySetInnerHTML={{ __html: TOPPERS[avatar.topper] }} />
    </svg>
  );
}
