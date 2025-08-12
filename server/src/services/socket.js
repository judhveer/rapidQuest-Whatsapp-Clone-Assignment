import { Server } from 'socket.io';
import { Message } from '../models/Message.js';

let io;

export function initSocket(httpServer, clientOrigin) {
  io = new Server(httpServer, { cors: { origin: clientOrigin, credentials: true } });

  io.on('connection', (socket) => {
    socket.on('identify', (self) => {
      socket.data.self = self;
      socket.join(self); // each user has a room == wa_id
    });

    socket.on('chat:open', async ({ self, peer }) => {
      try {
        const res = await Message.updateMany(
          { sender_wa_id: peer, receiver_wa_id: self, status: { $ne: 'read' } },
          { $set: { status: 'read', read_at: new Date() } }
        );
        if (res.modifiedCount > 0) {
          io.emit('chat:read', { self, peer }); // lightweight broadcast
        }
      } catch (e) {
        console.error('chat:open mark read error', e);
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
