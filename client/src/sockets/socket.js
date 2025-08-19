import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_BASE_URL, {
  transports: ['websocket'], // prefer ws
  // withCredentials: true,  // uncomment only if you rely on cookies
});

export default socket;
