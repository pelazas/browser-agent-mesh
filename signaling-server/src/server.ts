import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

const PORT = parseInt(process.env.PORT || '4444', 10);

interface Room {
  name: string;
  clients: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    room = { name, clients: new Set() };
    rooms.set(name, room);
  }
  return room;
}

function heartbeat(this: WebSocket & { alive?: boolean }) {
  this.alive = true;
}

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[signaling] listening on ws://0.0.0.0:${PORT}`);
});

wss.on('connection', (ws: WebSocket & { alive?: boolean; roomName?: string }, req: IncomingMessage) => {
  ws.alive = true;
  ws.on('pong', () => heartbeat.call(ws));

  // y-webrtc uses the URL path as the room name, e.g. /browser-agent-mesh
  const rawRoom = (req.url ?? '/default').split('?')[0].replace(/^\//, '');
  const roomName = rawRoom || 'default';
  const room = getRoom(roomName);

  room.clients.add(ws);
  ws.roomName = roomName;
  console.log(`[signaling] peer connected to ${roomName} (${room.clients.size} peers)`);

  ws.on('message', (data: Buffer, isBinary: boolean) => {
    const room = ws.roomName ? rooms.get(ws.roomName) : null;
    if (!room) return;

    for (const client of room.clients) {
      if (client === ws || client.readyState !== WebSocket.OPEN) continue;
      client.send(data, { binary: isBinary });
    }
  });

  ws.on('close', () => {
    if (ws.roomName) {
      const room = rooms.get(ws.roomName);
      if (room) {
        room.clients.delete(ws);
        console.log(`[signaling] peer left ${room.name} (${room.clients.size} peers)`);
        if (room.clients.size === 0) rooms.delete(room.name);
      }
    }
  });
});

// Heartbeat interval to detect dead connections
const interval = setInterval(() => {
  for (const room of rooms.values()) {
    for (const ws of room.clients) {
      const conn = ws as WebSocket & { alive?: boolean };
      if (!conn.alive) {
        conn.terminate();
        room.clients.delete(conn);
        continue;
      }
      conn.alive = false;
      conn.ping();
    }
  }
}, 30000);

wss.on('close', () => clearInterval(interval));

process.on('SIGTERM', () => {
  wss.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  wss.close();
  process.exit(0);
});
