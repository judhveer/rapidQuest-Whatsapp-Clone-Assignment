import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db.js';
import { toInternalDocs, toStatusUpdate } from '../utils/payload.js';
import { insertIncomingOrOutgoing, updateStatusByMetaOrId } from '../services/message.service.js';

// get --dir argument (defaults to ./payloads)
const argv = minimist(process.argv.slice(2));
const dir = path.resolve(argv.dir || './payloads');

(async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await connectDB(process.env.MONGODB_URI);

  if (!fs.existsSync(dir)) {
    console.error(`❌ Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.warn('⚠️ No .json files found in', dir);
    process.exit(0);
  }

  for (const f of files) {
    const full = path.join(dir, f);
    const raw = fs.readFileSync(full, 'utf8');
    const payload = JSON.parse(raw);

    const docs = toInternalDocs(payload);
    for (const d of docs) await insertIncomingOrOutgoing(d);

    // server/src/scripts/processPayloads.js

    // ... keep the rest unchanged ...
    const updates = toStatusUpdate(payload, { filename: f }); // <-- add { filename }
    for (const up of updates) {
      const stampField =
        up.status === 'delivered' ? 'delivered_at' :
          up.status === 'read' ? 'read_at' : null;
      await updateStatusByMetaOrId({ ...up, stampField });
    }
    console.log(`✅ Processed: ${f} → inserted: ${docs.length}, status updates: ${updates.length}`);

  }

  console.log('🎉 Done. Check Atlas → whatsapp.processed_messages');
  process.exit(0);
})();
