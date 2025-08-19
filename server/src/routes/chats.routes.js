import { Router } from 'express';
import {
  getChatHeadsForSelf,        // list of chats for a user
  getConversationMessages,    // messages between self and a peer
} from '../controllers/chats.controller.js';

const r = Router();

/**
 * GET /api/chats?self=<your_wa_id>
 * Returns chat heads for the given self (one row per peer).
 * Example: /api/chats?self=919937320320
 */
r.get('/', getChatHeadsForSelf);

/**
 * GET /api/chats/:peer_wa_id/messages?self=<your_wa_id>&limit=50&before=ISO
 * Returns chronological messages between self and peer.
 * Example: /api/chats/929967673820/messages?self=919937320320
 */
r.get('/:peer_wa_id/messages', getConversationMessages);

export default r;
