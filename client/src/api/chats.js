import api from './client';

export async function getChats(self) {
  const { data } = await api.get('/api/chats', { params: { self } });
  return data.data;
}

export async function getMessages(self, wa_id, params = {}) {
  const { data } = await api.get(`/api/chats/${wa_id}/messages`, { params: { self, ...params } });
  return data.data;
}
