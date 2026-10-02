import type { ClientRoomState } from '../net/reducer.js';
import { navigate } from '../hooks/usePath.js';
import { TapButton } from '../ui/TapButton.js';
import { Capn } from '../ui/Capn.js';

const COPY: Record<NonNullable<ClientRoomState['ended']>, { title: string; body: string }> = {
  notFound: { title: 'This room has ended', body: 'Last call was a while ago. Start a fresh one?' },
  expired: { title: 'This room has ended', body: 'Everyone wandered off, so we closed the tab.' },
  removed: { title: 'You were removed', body: 'The host took you out of this room.' },
  claimed: {
    title: 'Seat picked up elsewhere',
    body: 'You got back in on another device, so this one is off duty.',
  },
  left: { title: 'You left the room', body: 'Thanks for playing!' },
};

export function Ended({ reason }: { reason: NonNullable<ClientRoomState['ended']> }) {
  const copy = COPY[reason];
  return (
    <main className="screen ended">
      <div className="zone-content ended-hero">
        <Capn mood="sleepy" size={140} />
        <h1 className="title">{copy.title}</h1>
        <p className="hint">{copy.body}</p>
      </div>
      <div className="zone-action">
        <TapButton
          className="btn-primary"
          onClick={() => {
            navigate('/');
          }}
        >
          Create New Room
        </TapButton>
      </div>
    </main>
  );
}
