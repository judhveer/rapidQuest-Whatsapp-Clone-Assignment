import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { connectDB } from './db.js';
// add at top with other imports
import chatsRoutes from './routes/chats.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import http from 'http';


import { initSocket } from './services/socket.js';
import devRoutes from './routes/dev.routes.js';


const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(compression());
app.use(express.json());
app.use(morgan('dev'));

// after your app.use(...) middlewares
app.use('/api/chats', chatsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/dev', devRoutes);

// connect to MongoDB Atlas (DB name: whatsapp)
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in .env');
  process.exit(1);
}
await connectDB(MONGODB_URI);



// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => console.log(`API running on :${PORT}`));


// ⬇️ REPLACE app.listen(...) with this block
const server = http.createServer(app);
initSocket(server, process.env.CLIENT_ORIGIN || '*');
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`API running on :${PORT}`));