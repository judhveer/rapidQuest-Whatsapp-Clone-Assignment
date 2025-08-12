import { insertIncomingOrOutgoing, updateStatusByMetaOrId } from '../services/message.service.js';
import { Message } from '../models/Message.js';
import { getIO } from '../services/socket.js';


export async function createOutgoing(req, res) {
  try {
    const { from, to, text, contact_name } = req.body || {};
    if (!from || !to || !text?.trim()) {
      return res.status(400).json({ status: false, message: 'from, to and text are required' });
    }

    let doc = await insertIncomingOrOutgoing({
      sender_wa_id: from,
      receiver_wa_id: to,
      wa_id: to, // legacy peer field for UI
      contact_name: contact_name || '',
      direction: 'out',
      status: 'sent',
      message_type: 'text',
      text: text.trim(),
      sent_at: new Date()
    });

    if (!doc.meta_msg_id) doc.meta_msg_id = doc._id.toString();
    if (!doc.id) doc.id = doc.meta_msg_id;
    await doc.save();

    // broadcast new message
    getIO()?.emit('message:new', doc);

    // auto-deliver if receiver online (room exists)
    const io = getIO();
    const room = io?.sockets.adapter.rooms.get(to);
    if (room && room.size > 0) {
      await Message.updateOne({ _id: doc._id }, { $set: { status: 'delivered', delivered_at: new Date() } });
      getIO()?.emit('message:status', { meta_msg_id: doc.meta_msg_id, id: doc.id, status: 'delivered' });
    }

    return res.json({ status: true, data: doc });
  } catch (err) {
    console.error('createOutgoing error:', err);
    return res.status(500).json({ status: false, message: 'Internal error' });
  }
}

export async function updateStatus(req, res) {
  try {
    const { meta_msg_id } = req.params;
    const { id, status, at } = req.body || {};
    if (!meta_msg_id && !id) {
      return res.status(400).json({ status: false, message: 'meta_msg_id or id required' });
    }
    const stampField =
      status === 'delivered' ? 'delivered_at' :
      status === 'read' ? 'read_at' : (status === 'sent' ? 'sent_at' : null);

    const updated = await updateStatusByMetaOrId({ meta_msg_id, id, status, stampField, at: at ? new Date(at) : undefined });
    if (updated) {
      getIO()?.emit('message:status', { meta_msg_id: updated.meta_msg_id, id: updated.id, status: updated.status });
    }
    return res.json({ status: true, data: updated });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ status: false, message: 'Internal error' });
  }
}


