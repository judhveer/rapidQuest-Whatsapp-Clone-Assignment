import { Message, MESSAGE_STATUS } from '../models/Message.js';
// Realtime helpers—will exist only when the HTTP server is running.
// In scripts (processPayloads), Socket.IO isn't initialized, so we guard safely.
import { getIO, isUserOnline, isChatOpenFor } from './socket.js';

function safeIO() {
  try { return getIO(); } catch { return null; }
}

/**
 * Create (insert) a message if it doesn't already exist.
 * Also (when sockets are available) emit realtime events and auto-upgrade
 * status to delivered/read based on the receiver's live state.
 */
export async function insertIncomingOrOutgoing(doc) {
  // Idempotency: skip if we already have this WhatsApp message id
  if (doc.meta_msg_id) {
    const exists = await Message.findOne({ meta_msg_id: doc.meta_msg_id });
    if (exists) return exists;
  }

  // Create the message
  const created = await Message.create(doc);

  // If Socket.IO isn't running (e.g., from scripts), just return
  const io = safeIO();
  if (!io) return created;

  // Always notify the receiver's room about the new message
  // io.to(created.receiver_wa_id).emit('message:new', created);
  io.to(created.receiver_wa_id).to(created.sender_wa_id).emit('message:new', created);

  // Decide status right away based on the receiver's live state
  const metaId = created.meta_msg_id;
  const now = new Date();

  // If the receiver is online AND currently viewing this chat → instant READ
  if (typeof isChatOpenFor === 'function' &&
    isChatOpenFor(created.receiver_wa_id, created.sender_wa_id)) {
    await Message.markRead(metaId);

    // Emit precise status to both parties
    io.to(created.receiver_wa_id).to(created.sender_wa_id).emit('message:status', {
      meta_msg_id: metaId,
      status: MESSAGE_STATUS.READ,
      read_at: now,
    });

    // Keep the returned object consistent
    created.status = MESSAGE_STATUS.READ;
    created.read_at = now;
    return created;
  }

  // Else if the receiver is online elsewhere → DELIVERED
  if (typeof isUserOnline === 'function' && isUserOnline(created.receiver_wa_id)) {
    await Message.markDelivered(metaId);

    io.to(created.receiver_wa_id).to(created.sender_wa_id).emit('message:status', {
      meta_msg_id: metaId,
      status: MESSAGE_STATUS.DELIVERED,
      delivered_at: now,
    });

    created.status = MESSAGE_STATUS.DELIVERED;
    created.delivered_at = now;
    return created;
  }

  // Else keep SENT, but you may still echo an ack to the sender
  io.to(created.sender_wa_id).emit('message:status', {
    meta_msg_id: metaId,
    status: MESSAGE_STATUS.SENT,
  });

  return created;
}

/**
 * Update status for a message (by meta_msg_id).
 * Uses model statics to enforce forward-only transitions and set timestamps atomically.
 * Also emits realtime status when sockets are available.
 */
export async function updateStatusByMetaOrId({ meta_msg_id, status /*, at */ }) {
  if (!meta_msg_id) throw new Error('meta_msg_id required');

  // Apply using the model helpers (timestamps set inside)
  switch (status) {
    case MESSAGE_STATUS.READ:
      await Message.markRead(meta_msg_id);
      break;
    case MESSAGE_STATUS.DELIVERED:
      await Message.markDelivered(meta_msg_id);
      break;
    case MESSAGE_STATUS.SENT:
    case MESSAGE_STATUS.QUEUED:
    case MESSAGE_STATUS.FAILED:
      await Message.setStatus(meta_msg_id, status);
      break;
    default:
      return null; // unknown status: ignore
  }

  // Fetch updated doc for emitting + return
  const updated = await Message.findOne({ meta_msg_id }).lean();

  const io = safeIO();
  if (io && updated) {
    io.to(updated.receiver_wa_id).to(updated.sender_wa_id).emit('message:status', {
      meta_msg_id,
      status: updated.status,
      delivered_at: updated.delivered_at,
      read_at: updated.read_at,
    });
  }

  return updated;
}

/**
 * Chat heads for the current user (self).
 * Returns one row per peer with last message + unread count.
 * NOTE: returns 'peer_wa_id' (we've removed legacy 'wa_id').
 */
export async function findChatHeadsForSelf(self) {
  const pipeline = [
    { $match: { $or: [{ sender_wa_id: self }, { receiver_wa_id: self }] } },
    { $sort: { createdAt: -1 } },
    {
      $addFields: {
        peer: { $cond: [{ $eq: ['$sender_wa_id', self] }, '$receiver_wa_id', '$sender_wa_id'] }
      }
    },
    {
      $group: {
        _id: '$peer',
        lastMessage: { $first: '$$ROOT' },
        unread: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$receiver_wa_id', self] }, { $ne: ['$status', 'read'] }] },
              1, 0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        peer_wa_id: '$_id', // <— renamed field for the frontend
        contact_name: '$lastMessage.contact_name',
        lastMessage: {
          text: '$lastMessage.text',
          status: '$lastMessage.status',
          createdAt: '$lastMessage.createdAt',
          direction: { $cond: [{ $eq: ['$lastMessage.sender_wa_id', self] }, 'out', 'in'] }
        },
        unread: 1
      }
    },
    { $sort: { 'lastMessage.createdAt': -1 } }
  ];
  return Message.aggregate(pipeline);
}

/**
 * All messages between self and peer (chronological).
 * Adds direction client-side style: 'out' if I sent it, else 'in'.
 */
export async function findMessagesBetween(self, peer, { limit = 100, before } = {}) {
  const query = {
    $or: [
      { sender_wa_id: self, receiver_wa_id: peer },
      { sender_wa_id: peer, receiver_wa_id: self }
    ]
  };
  if (before) query.createdAt = { $lt: new Date(before) };

  const docs = await Message.find(query)
    .sort({ createdAt: 1 })
    .limit(Number(limit) || 100)
    .lean();

  return docs.map(d => ({ ...d, direction: d.sender_wa_id === self ? 'out' : 'in' }));
}

/* ──────────────────────────────────────────────────────────────
   Legacy helpers removed:
     - findChatHeads()      // used 'wa_id' (we deleted that field)
     - findMessagesByWaId() // used 'wa_id'
   Update routes/controllers to use:
     - findChatHeadsForSelf(self)
     - findMessagesBetween(self, peer)
   ────────────────────────────────────────────────────────────── */
