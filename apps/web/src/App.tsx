import { isValidCode } from '@tap-in/shared';
import { usePath } from './hooks/usePath.js';
import { Home } from './screens/Home.js';
import { Room } from './screens/Room.js';
import { SyncTest } from './screens/SyncTest.js';
import { Capn } from './ui/Capn.js';

export function App() {
  const path = usePath();
  const slug = path.slice(1).toUpperCase();
  let page;
  if (path === '/sync-test') page = <SyncTest />;
  else if (isValidCode(slug)) page = <Room key={slug} code={slug} />;
  else page = <Home />;
  return (
    <>
      {page}
      <div className="rotate-guard" role="alert">
        <Capn mood="shook" size={110} />
        <p className="title">Tip me back upright!</p>
        <p className="hint">Tap In plays in portrait.</p>
      </div>
    </>
  );
}
