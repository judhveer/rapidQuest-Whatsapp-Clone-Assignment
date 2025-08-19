import {
  findChatHeadsForSelf,
  findMessagesBetween,
} from '../services/message.service.js';

/**
 * GET /api/chats?self=<your_wa_id>
 * Returns one chat-row per peer with lastMessage + unread count.
 * Example: /api/chats?self=919937320320
 */
export async function getChatHeadsForSelf(req, res) {
  try {
    const self = req.query.self;
    if (!self) {
      return res.status(400).json({
        status: false,
        error: "`self` query param is required, e.g. /api/chats?self=919937320320",
      });
    }

    const data = await findChatHeadsForSelf(self);
    // data items look like:
    // {
    //   peer_wa_id: "929967673820",
    //   contact_name: "Neha Joshi",
    //   lastMessage: { text, status, createdAt, direction },
    //   unread: 2
    // }
    return res.json({ status: true, data });
  } catch (err) {
    console.error("getChatHeadsForSelf error:", err);
    return res.status(500).json({ status: false, error: "Internal error" });
  }
}

/**
 * GET /api/chats/:peer_wa_id/messages?self=<your_wa_id>&limit=50&before=<ISO>
 * Returns chronological messages between self and that peer.
 * Example: /api/chats/929967673820/messages?self=919937320320
 */
export async function getConversationMessages(req, res) {
  try {
    const { peer_wa_id } = req.params;
    const { self, limit, before } = req.query;

    if (!self || !peer_wa_id) {
      return res.status(400).json({
        status: false,
        error:
          "`self` (query) and `peer_wa_id` (param) are required, e.g. /api/chats/929.../messages?self=919...",
      });
    }

    const data = await findMessagesBetween(self, peer_wa_id, { limit, before });
    // each message already has direction computed in service:
    // direction = (sender_wa_id === self ? 'out' : 'in')
    return res.json({ status: true, data });
  } catch (err) {
    console.error("getConversationMessages error:", err);
    return res.status(500).json({ status: false, error: "Internal error" });
  }
}
