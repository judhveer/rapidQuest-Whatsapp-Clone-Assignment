import api from './client';

export async function sendMessage(from, to, text, contact_name) {
  const { data } = await api.post('/api/messages', { from, to, text, contact_name });
  return data.data;
}


