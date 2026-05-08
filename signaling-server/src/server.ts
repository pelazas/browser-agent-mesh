import { WebSocketServer, WebSocket } from 'ws';

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

wss.on('connection', (ws: WebSocket & { alive?: boolean; roomName?: string }) => {
  ws.alive = true;
  ws.on('pong', () => heartbeat.call(ws));

  ws.on('message', (raw: Buffer) => {
    let msg: { type: string; room?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join' && msg.room) {
      const room = getRoom(msg.room);
      room.clients.add(ws);
      ws.roomName = msg.room;
      console.log(`[signaling] peer joined room: ${msg.room} (${room.clients.size} peers)`);
      return;
    }

    if (msg.type === 'leave' && msg.room) {
      const room = rooms.get(msg.room);
      if (room) {
        room.clients.delete(ws);
        if (room.clients.size === 0) rooms.delete(msg.room);
      }
      return;
    }

    // Relay message to all other peers in the same room
    if (ws.roomName) {
      const room = rooms.get(ws.roomName);
      if (room) {
        const payload = JSON.stringify(msg);
        for (const client of room.clients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomName) {
      const room = rooms.get(ws.roomName);
      if (room) {
        room.clients.delete(ws);
        console.log(`[signaling] peer left room: ${ws.roomName} (${room.clients.size} peers)`);
        if (room.clients.size === 0) rooms.delete(ws.roomName);
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
