import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db.js';
import { toInternalDocs, toStatusUpdate } from '../utils/payload.js';
import { insertIncomingOrOutgoing, updateStatusByMetaOrId } from '../services/message.service.js';

// CLI flags:
//   --dir ./payloads   (folder with *.json files)
//   --dry              (parse & log only; no DB writes)
const argv = minimist(process.argv.slice(2), {
  string: ['dir'],
  boolean: ['dry'],
  default: { dir: './payloads', dry: false },
});

const dir = path.resolve(argv.dir);

(async function run() {
  // 1) Guard: DB URL must exist
  if (!process.env.MONGODB_URI) {
    console.error('❌ Missing MONGODB_URI in .env');
    process.exit(1);
  }

  // 2) Connect to MongoDB
  await connectDB(process.env.MONGODB_URI);

  // 3) Guard: folder must exist
  if (!fs.existsSync(dir)) {
    console.error(`❌ Directory not found: ${dir}`);
    process.exit(1);
  }

  // 4) Load all *.json files
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.warn('⚠️ No .json files found in', dir);
    process.exit(0);
  }

  let totalInserted = 0;
  let totalUpdated = 0;

  // 5) Process each file, but never crash the whole run
  for (const f of files) {
    const full = path.join(dir, f);
    let inserted = 0;
    let updated = 0;

    try {
      const raw = fs.readFileSync(full, 'utf8');
      const payload = JSON.parse(raw);

      // A) Map "messages" payloads → our internal doc shape
      const docs = toInternalDocs(payload);

      // Insert (skip if --dry)
      for (const d of docs) {
        if (argv.dry) continue;
        try {
          await insertIncomingOrOutgoing(d); // your service handles create/upsert rules
          inserted++;
        } catch (err) {
          // Ignore duplicate key errors (idempotency via unique sparse meta_msg_id)
          if (err && String(err.message).includes('E11000')) {
            // console.log(`↪︎ skip duplicate meta_msg_id=${d.meta_msg_id}`);
            continue;
          }
          throw err;
        }
      }

      // B) Map "statuses" payloads → status updates
      const updates = toStatusUpdate(payload);

      // Apply status updates (skip if --dry)
      for (const up of updates) {
        if (argv.dry) continue;

        // Our model statics set timestamps automatically (delivered_at / read_at),
        // so we only need the status + meta_msg_id here.
        await updateStatusByMetaOrId({
          meta_msg_id: up.meta_msg_id,
          status: up.status,
          // If you want to respect provider time, you can pass: at: up.at
        });
        updated++;
      }

      totalInserted += inserted;
      totalUpdated += updated;

      console.log(`✅ ${f}: inserted ${inserted}, status updated ${updated}`);
    } catch (err) {
      console.error(`❌ ${f}:`, err?.message || err);
      continue; // move on to next file
    }
  }

  console.log(`\n🎉 Done. Files: ${files.length}, inserted: ${totalInserted}, status updated: ${totalUpdated}`);
  process.exit(0);
})();
