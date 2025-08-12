import { Router } from 'express';
import { getChats, getMessages } from '../controllers/chats.controller.js';

const r = Router();
r.get('/', getChats);
r.get('/:wa_id/messages', getMessages);

export default r;
