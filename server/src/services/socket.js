import { Server } from 'socket.io';
import { Message } from '../models/Message.js';

let io;

/**
 * Initialize Socket.IO and all server-side events.
 */
export function initSocket(httpServer, clientOrigin) {
  io = new Server(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
  });

  io.on('connection', (socket) => {
    // identify this socket (which user number is this tab?)
    socket.on('identify', (self) => {
      socket.data.self = self;
      socket.join(self); // each user has a room == their wa_id
    });

    /**
     * Mark chat as "open" for this socket.
     * - store open peer for this socket (for instant READ on new msgs)
     * - bulk mark peer->self unread as READ and emit precise IDs
     */
    socket.on('chat:open', async ({ self, peer }) => {
      socket.data.self = self;     // redundancy ok
      socket.data.openPeer = peer; // track currently open chat
      socket.join(self);

      try {
        const now = new Date();

        // 1) get exact meta_msg_ids that will be marked read
        const toRead = await Message.find(
          { sender_wa_id: peer, receiver_wa_id: self, status: { $ne: 'read' } },
          { meta_msg_id: 1, _id: 1 }
        ).lean();

        if (!toRead.length) return;

        // 2) update them in one DB call
        await Message.updateMany(
          { sender_wa_id: peer, receiver_wa_id: self, status: { $ne: 'read' } },
          { $set: { status: 'read', read_at: now } }
        );

        // 3) notify both sides with precise IDs (client flips ticks without refetch)
        const ids = toRead.map(x => x.meta_msg_id || String(x._id)).filter(Boolean);
        io.to(self).to(peer).emit('message:status:bulk', {
          ids,
          status: 'read',
          read_at: now,
        });
      } catch (e) {
        console.error('chat:open mark read error', e);
      }
    });

    // (optional) cleanup
    socket.on('disconnect', () => {
      // nothing special required; rooms auto-handle membership
      // socket.data.openPeer = undefined;
    });
  });

  return io;
}

/** Accessor for other modules (services/controllers) */
export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/** Is there at least one socket in this user's room? */
export function isUserOnline(wa_id) {
  try {
    const room = io?.sockets?.adapter?.rooms?.get(wa_id);
    return Boolean(room && room.size > 0);
  } catch {
    return false;
  }
}

/**
 * Is the receiver currently viewing the chat with withPeer?
 * We check every socket in the receiver's room and see if any has data.openPeer === withPeer
 */
export function isChatOpenFor(receiver, withPeer) {
  try {
    const room = io?.sockets?.adapter?.rooms?.get(receiver);
    if (!room) return false;
    for (const socketId of room) {
      const s = io.sockets.sockets.get(socketId);
      if (s?.data?.openPeer === withPeer) return true;
    }
    return false;
  } catch {
    return false;
  }
}
