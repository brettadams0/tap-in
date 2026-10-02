import { useState } from 'react';
import { isValidCode, normalizeCode } from '@tap-in/shared';
import { createRoom } from '../net/api.js';
import { navigate } from '../hooks/usePath.js';
import { TapButton } from '../ui/TapButton.js';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      navigate(`/${await createRoom()}`);
    } catch {
      setError("Couldn't reach the bar. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <main className="screen home">
      <div className="zone-content home-hero">
        <h1 className="logo" aria-label="Tap In!">
          <span>TAP</span>
          <span>IN</span>
          <span className="bang">!</span>
        </h1>
        <p className="hint home-tag">
          The party game that lives on everyone&apos;s phone. 3–8 players. No app, no logins.
        </p>
      </div>

      <div className="zone-action">
        <TapButton className="btn-primary" onClick={() => void create()} disabled={busy}>
          {busy ? 'Pouring…' : 'Create Room'}
        </TapButton>
        <form
          className="join-code"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidCode(code)) navigate(`/${code}`);
          }}
        >
          <label className="label" htmlFor="code">
            Got a code?
          </label>
          <div className="join-code-row">
            <input
              id="code"
              className="field code-input"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ABCD"
              value={code}
              onChange={(e) => {
                setCode(normalizeCode(e.target.value));
              }}
              aria-label="Room code"
            />
            <TapButton type="submit" className="btn-small" disabled={!isValidCode(code)}>
              Join
            </TapButton>
          </div>
        </form>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
