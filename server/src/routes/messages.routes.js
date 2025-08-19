import { Router } from 'express';
import {
  createOutgoing,        // POST /api/messages
  updateStatus,          // PUT  /api/messages/:meta_msg_id/status
  markThreadRead,        // PUT  /api/messages/read?self=...&peer=...   (optional but handy)
} from '../controllers/messages.controller.js';

const r = Router();

/**
 * Create/send an outgoing message
 * Body: { self, peer, text, contact_name?, clientMsgId? }
 */
r.post('/', createOutgoing);

/**
 * Update a single message's status by its meta_msg_id (wamid…)
 * Body: { status: 'sent' | 'delivered' | 'read' | 'failed' }
 */
r.put('/:meta_msg_id/status', updateStatus);

/**
 * (Optional) Mark ALL incoming messages from peer -> self as read
 * Query: ?self=<your_wa_id>&peer=<their_wa_id>
 * Useful fallback if sockets aren’t involved.
 */
r.put('/read', markThreadRead);

export default r;
