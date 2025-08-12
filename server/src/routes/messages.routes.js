import { Router } from 'express';
import { createOutgoing, updateStatus } from '../controllers/messages.controller.js';

const r = Router();
r.post('/', createOutgoing);
r.put('/:meta_msg_id/status', updateStatus); // demo endpoint to trigger status changes

export default r;
