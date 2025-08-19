import api from './client';

// GET /api/chats?self=<your_wa_id>
export async function getChats(self) {
  const { data } = await api.get('/api/chats', { params: { self } });
  return data.data;
}

// GET /api/chats/:peer_wa_id/messages?self=<your_wa_id>
export async function getMessages(self, peer_wa_id, params = {}) {
  const { data } = await api.get(`/api/chats/${peer_wa_id}/messages`, {
    params: { self, ...params },
  });
  return data.data;
}
