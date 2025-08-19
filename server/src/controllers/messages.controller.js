import { Message, MESSAGE_STATUS } from '../models/Message.js';
import {
  insertIncomingOrOutgoing,
  updateStatusByMetaOrId,
} from '../services/message.service.js';
import { getIO } from '../services/socket.js';

/**
 * POST /api/messages
 * Body: { self, peer, text, contact_name?, clientMsgId? }
 * Creates an outgoing message FROM self TO peer.
 * Realtime emit + delivered/read auto-upgrade are handled inside the service.
 */
export async function createOutgoing(req, res) {
  try {
    const { self, peer, text, contact_name, clientMsgId } = req.body || {};

    if (!self || !peer || !text?.trim()) {
      return res.status(400).json({
        status: false,
        message: '`self`, `peer` and non-empty `text` are required',
      });
    }

    // Build the doc for our Message model (lean + no legacy wa_id)
    const doc = {
      sender_wa_id: self,
      receiver_wa_id: peer,

      message_type: 'text',
      text: text.trim(),

      contact_name: contact_name || '',
      sent_at: new Date(),

      // Optional – helps correlate optimistic UI messages if you like
      // (does not need to be unique)
      external_id: clientMsgId || undefined,
    };

    // Service inserts + (if sockets running) emits message:new
    // and upgrades status to delivered/read based on receiver's live state.
    const created = await insertIncomingOrOutgoing(doc);

    return res.json({ status: true, data: created });
  } catch (err) {
    console.error('createOutgoing error:', err);
    return res.status(500).json({ status: false, message: 'Internal error' });
  }
}

/**
 * PUT /api/messages/:meta_msg_id/status
 * Body: { status: 'sent' | 'delivered' | 'read' | 'failed' }
 * Updates a single message's status. Service enforces forward-only + timestamps.
 */
export async function updateStatus(req, res) {
  try {
    const { meta_msg_id } = req.params;
    const { status } = req.body || {};

    if (!meta_msg_id) {
      return res.status(400).json({ status: false, message: 'meta_msg_id required in URL' });
    }

    const allowed = new Set(Object.values(MESSAGE_STATUS));
    if (!allowed.has(String(status))) {
      return res.status(400).json({ status: false, message: 'Invalid status' });
    }

    const updated = await updateStatusByMetaOrId({ meta_msg_id, status });
    return res.json({ status: true, data: updated });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ status: false, message: 'Internal error' });
  }
}

/**
 * (Optional) PUT /api/messages/read?self=...&peer=...
 * Marks ALL incoming messages from peer -> self as READ.
 * Emits a bulk status event with exact ids so the client flips ticks instantly.
 */
export async function markThreadRead(req, res) {
  try {
    const { self, peer } = req.query;
    if (!self || !peer) {
      return res.status(400).json({
        status: false,
        message: '`self` and `peer` are required query params',
      });
    }

    const now = new Date();

    // 1) Collect affected message ids first so client can update without refetch
    const toRead = await Message.find(
      { sender_wa_id: peer, receiver_wa_id: self, status: { $ne: MESSAGE_STATUS.READ } },
      { meta_msg_id: 1, _id: 1 }
    ).lean();

    if (!toRead.length) {
      return res.json({ status: true, data: { modified: 0, ids: [] } });
    }

    // 2) Update them all in one shot
    const upd = await Message.updateMany(
      { sender_wa_id: peer, receiver_wa_id: self, status: { $ne: MESSAGE_STATUS.READ } },
      { $set: { status: MESSAGE_STATUS.READ, read_at: now } }
    );

    // 3) Emit bulk precise event (only if sockets are running)
    const io = (() => { try { return getIO(); } catch { return null; } })();
    if (io) {
      const ids = toRead.map(x => x.meta_msg_id || String(x._id)).filter(Boolean);
      io.to(self).to(peer).emit('message:status:bulk', {
        ids,
        status: MESSAGE_STATUS.READ,
        read_at: now,
      });
    }

    return res.json({
      status: true,
      data: { modified: upd.modifiedCount ?? 0, ids: toRead.map(x => x.meta_msg_id || String(x._id)) },
    });
  } catch (err) {
    console.error('markThreadRead error:', err);
    return res.status(500).json({ status: false, message: 'Internal error' });
  }
}
