import api from './client';

// POST /api/messages
// body: { self, peer, text, contact_name?, clientMsgId? }
export async function sendMessage(self, peer, text, contact_name, clientMsgId) {
  const { data } = await api.post('/api/messages', {
    self,
    peer,
    text,
    contact_name,
    clientMsgId,
  });
  return data.data;
}
