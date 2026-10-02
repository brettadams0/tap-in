import { useEffect, useState, useSyncExternalStore } from 'react';
import { RoomConnection } from '../net/connection.js';
import type { ClientRoomState } from '../net/reducer.js';

export function useRoom(code: string): { conn: RoomConnection; room: ClientRoomState } {
  const [conn] = useState(() => new RoomConnection(code));
  useEffect(() => {
    conn.start();
    return () => {
      conn.stop();
    };
  }, [conn]);
  const room = useSyncExternalStore(conn.subscribe, conn.getSnapshot);
  return { conn, room };
}
