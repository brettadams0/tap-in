import { useRef, type ButtonHTMLAttributes } from 'react';

const BURST_COLORS = ['#FFB81C', '#F7ECD8', '#15100D'];

/** Sticker button: squash + halftone burst on pointerdown, before any network call (<50 ms). */
export function TapButton({
  className = '',
  onPointerDown,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className={`btn ${className}`}
      onPointerDown={(e) => {
        const el = ref.current;
        if (el && !rest.disabled && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const r = el.getBoundingClientRect();
          for (let i = 0; i < 8; i++) {
            const dot = document.createElement('span');
            const a = Math.random() * Math.PI * 2;
            const d = 36 + Math.random() * 44;
            dot.className = 'burst-dot';
            dot.style.left = `${e.clientX - r.left - 5}px`;
            dot.style.top = `${e.clientY - r.top - 5}px`;
            dot.style.background = BURST_COLORS[i % BURST_COLORS.length] as string;
            dot.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            dot.style.setProperty('--dy', `${Math.sin(a) * d}px`);
            el.appendChild(dot);
            setTimeout(() => {
              dot.remove();
            }, 450);
          }
          if ('vibrate' in navigator) navigator.vibrate(10);
        }
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
