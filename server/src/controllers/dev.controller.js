import { insertIncomingOrOutgoing, updateStatusByMetaOrId } from '../services/message.service.js';
import { getIO } from '../services/socket.js';

// Simulate an INCOMING message from the other person
export async function devIncoming(req, res) {
  try {
    const { wa_id, text, contact_name } = req.body || {};
    if (!wa_id || !text?.trim()) {
      return res.status(400).json({ status: false, message: 'wa_id and text are required' });
    }

    const doc = await insertIncomingOrOutgoing({
      wa_id,
      contact_name: contact_name || '',
      direction: 'in',
      status: 'sent',
      message_type: 'text',
      text: text.trim(),
      sent_at: new Date(),
    });

    getIO()?.emit('message:new', doc);
    return res.json({ status: true, data: doc });
  } catch (e) {
    console.error('devIncoming error:', e);
    res.status(500).json({ status: false, message: 'Internal error' });
  }
}

// Mark a message delivered/read by id (use meta_msg_id or id)
export async function devSetStatus(req, res) {
  try {
    const { id, status } = req.body || {};
    if (!id || !status) {
      return res.status(400).json({ status: false, message: 'id and status required' });
    }
    const stampField = status === 'delivered' ? 'delivered_at' : status === 'read' ? 'read_at' : null;
    const updated = await updateStatusByMetaOrId({ meta_msg_id: id, id, status, stampField });
    if (updated) {
      getIO()?.emit('message:status', { meta_msg_id: updated.meta_msg_id, id: updated.id, status: updated.status });
    }
    return res.json({ status: true, data: updated });
  } catch (e) {
    console.error('devSetStatus error:', e);
    res.status(500).json({ status: false, message: 'Internal error' });
  }
}
