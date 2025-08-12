import { Router } from 'express';
import { devIncoming, devSetStatus } from '../controllers/dev.controller.js';

const r = Router();
r.post('/incoming', devIncoming);     // POST /api/dev/incoming
r.put('/status', devSetStatus);       // PUT  /api/dev/status

export default r;
