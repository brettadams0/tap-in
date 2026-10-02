import { useState } from 'react';
import {
  NAME_MAX,
  cleanName,
  graphemes,
  randomAvatar,
  type Avatar,
  type WelcomeInfo,
} from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { loadProfile, saveProfile } from '../net/storage.js';
import { CapBuilder } from '../ui/CapBuilder.js';
import { TapButton } from '../ui/TapButton.js';

export function JoinForm({
  conn,
  welcome,
  onClaim,
}: {
  conn: RoomConnection;
  welcome: WelcomeInfo;
  onClaim: (() => void) | null;
}) {
  const [profile] = useState(loadProfile);
  const [step, setStep] = useState<'name' | 'cap'>('name');
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState<Avatar>(() => {
    const saved = profile.avatar;
    if (saved && !welcome.takenColors.includes(saved.color)) return saved;
    return randomAvatar(Math.random, welcome.takenColors);
  });
  const clean = cleanName(name);
  // Someone grabbed our colour while we were choosing: move to a free one.
  const colorTaken = welcome.takenColors.includes(avatar.color);

  const join = (): void => {
    saveProfile({ name: clean, avatar });
    conn.join(clean, avatar);
  };

  if (welcome.full) {
    return (
      <main className="screen">
        <div className="zone-content">
          <h1 className="title">Room {welcome.code} is full</h1>
          <p className="hint">
            8 players max. Ask the host to remove someone, or start a new room.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen join">
      <div className="zone-content">
        <p className="label">Room {welcome.code}</p>
        {step === 'name' ? (
          <>
            <h1 className="title">What do we call you?</h1>
            <input
              className="field"
              autoFocus
              autoComplete="nickname"
              enterKeyHint="next"
              maxLength={NAME_MAX * 2}
              placeholder="Your name"
              value={name}
              onChange={(e) => {
                setName(graphemes(e.target.value).slice(0, NAME_MAX).join(''));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && clean) setStep('cap');
              }}
              aria-label="Your name"
            />
            <p className="hint">{NAME_MAX - graphemes(clean).length} characters left</p>
            {onClaim && (
              <button type="button" className="link-btn" onClick={onClaim}>
                Already in this game on another phone? Get back in →
              </button>
            )}
          </>
        ) : (
          <>
            <h1 className="title">Build your cap</h1>
            <CapBuilder
              value={avatar}
              onChange={setAvatar}
              taken={welcome.takenColors.map((color) => ({ color }))}
            />
          </>
        )}
      </div>
      <div className="zone-action">
        {step === 'name' ? (
          <TapButton
            className="btn-primary"
            disabled={!clean}
            onClick={() => {
              setStep('cap');
            }}
          >
            Next
          </TapButton>
        ) : (
          <>
            <TapButton className="btn-primary" disabled={colorTaken} onClick={join}>
              {colorTaken ? 'Colour taken, pick another' : 'Tap In'}
            </TapButton>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setStep('name');
              }}
            >
              ← Change name
            </button>
          </>
        )}
      </div>
    </main>
  );
}
