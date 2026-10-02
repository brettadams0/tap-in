/** "Build your cap" (DESIGN.md §11): live preview + 4 tabs, Shuffle, taken colours marked. */
import { useState } from 'react';
import {
  CAP_COLORS,
  CAP_EYES,
  CAP_MOUTHS,
  CAP_PATTERNS,
  CAP_TOPPERS,
  randomAvatar,
  type Avatar,
  type CapColor,
} from '@tap-in/shared';
import { Cap } from './Cap.js';

type Tab = 'color' | 'pattern' | 'face' | 'topper';
const TABS: { id: Tab; label: string }[] = [
  { id: 'color', label: 'Colour' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'face', label: 'Face' },
  { id: 'topper', label: 'Topper' },
];

export interface CapBuilderProps {
  value: Avatar;
  onChange: (a: Avatar) => void;
  /** Colours taken by other players, with their names for the label. */
  taken: { color: CapColor; name?: string }[];
}

export function CapBuilder({ value, onChange, taken }: CapBuilderProps) {
  const [tab, setTab] = useState<Tab>('color');
  const [spin, setSpin] = useState(0);
  const takenColors = taken.map((t) => t.color);
  const set = (patch: Partial<Avatar>): void => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="builder">
      <div className="builder-preview">
        <div key={spin} className={spin ? 'builder-spin' : undefined}>
          <Cap avatar={value} size={120} label="Your cap" className="cap-bob" />
        </div>
        <button
          type="button"
          className="btn btn-small builder-shuffle"
          aria-label="Shuffle a random cap"
          onClick={() => {
            onChange(randomAvatar(Math.random, takenColors));
            setSpin((n) => n + 1);
          }}
        >
          🎲
        </button>
      </div>

      <div className="seg" role="tablist" aria-label="Cap parts">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-pressed={tab === t.id}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="builder-panel" role="tabpanel">
        {tab === 'color' && (
          <div className="swatches">
            {CAP_COLORS.map((c) => {
              const owner = taken.find((t) => t.color === c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="swatch"
                  style={{ background: c.hex }}
                  aria-pressed={value.color === c.id}
                  aria-label={
                    owner ? `${c.name}, taken${owner.name ? ` by ${owner.name}` : ''}` : c.name
                  }
                  disabled={!!owner}
                  onClick={() => {
                    set({ color: c.id });
                  }}
                >
                  {owner && <span className="swatch-taken">✕</span>}
                </button>
              );
            })}
          </div>
        )}
        {tab === 'pattern' && (
          <OptionGrid
            items={CAP_PATTERNS}
            current={value.pattern}
            render={(p) => ({ ...value, pattern: p })}
            onPick={(p) => {
              set({ pattern: p });
            }}
          />
        )}
        {tab === 'face' && (
          <>
            <div className="label">Eyes</div>
            <OptionGrid
              items={CAP_EYES}
              current={value.eyes}
              render={(e) => ({ ...value, eyes: e, topper: 'none' })}
              onPick={(e) => {
                set({ eyes: e });
              }}
            />
            <div className="label">Mouth</div>
            <OptionGrid
              items={CAP_MOUTHS}
              current={value.mouth}
              render={(m) => ({ ...value, mouth: m, topper: 'none' })}
              onPick={(m) => {
                set({ mouth: m });
              }}
            />
          </>
        )}
        {tab === 'topper' && (
          <OptionGrid
            items={CAP_TOPPERS}
            current={value.topper}
            render={(t) => ({ ...value, topper: t })}
            onPick={(t) => {
              set({ topper: t });
            }}
          />
        )}
      </div>
    </div>
  );
}

function OptionGrid<T extends string>({
  items,
  current,
  render,
  onPick,
}: {
  items: readonly T[];
  current: T;
  render: (item: T) => Avatar;
  onPick: (item: T) => void;
}) {
  return (
    <div className="options">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className="option"
          aria-pressed={item === current}
          aria-label={item}
          onClick={() => {
            onPick(item);
          }}
        >
          <Cap avatar={render(item)} size={50} label={item} />
        </button>
      ))}
    </div>
  );
}
