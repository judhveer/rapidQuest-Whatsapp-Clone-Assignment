import { findChatHeads, findMessagesByWaId, findChatHeadsForSelf, findMessagesBetween } from '../services/message.service.js';


export async function getChats(req, res) {
  const self = req.query.self;
  if (!self) {
    const legacy = await findChatHeads();
    return res.json({ status: true, data: legacy });
  }
  const [multi, legacy] = await Promise.all([findChatHeadsForSelf(self), findChatHeads()]);
  const map = new Map();
  for (const c of legacy) map.set(c.wa_id, c);
  for (const c of multi)  map.set(c.wa_id, { ...map.get(c.wa_id), ...c });
  const merged = Array.from(map.values()).sort((a,b) =>
    new Date(b?.lastMessage?.createdAt||0) - new Date(a?.lastMessage?.createdAt||0)
  );
  res.json({ status: true, data: merged });
}

export async function getMessages(req, res) {
  const { wa_id: peer } = req.params;
  const { self, limit, before } = req.query;
  if (self) {
    const data = await findMessagesBetween(self, peer, { limit, before });
    if (!data.length) {
      const legacy = await findMessagesByWaId(peer, { limit, before });
      return res.json({ status: true, data: legacy });
    }
    return res.json({ status: true, data });
  }
  const legacy = await findMessagesByWaId(peer, { limit, before });
  res.json({ status: true, data: legacy });
}