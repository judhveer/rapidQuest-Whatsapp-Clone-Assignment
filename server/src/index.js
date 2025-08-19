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


const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false // set true only if you use cookies/auth
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use(morgan('dev'));

// after your app.use(...) middlewares
app.use('/api/chats', chatsRoutes);
app.use('/api/messages', messagesRoutes);

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



const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => console.log('HTTP server closed.'));
  await mongoose.connection.close(); // if using Mongoose inside connectDB
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

