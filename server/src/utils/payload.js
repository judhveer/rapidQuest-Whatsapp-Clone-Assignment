// server/src/utils/payload.js

// Map WhatsApp "messages" payloads (user text/media) → our Message docs
export function toInternalDocs(payload) {
  const out = [];
  const entries = payload?.metaData?.entry || [];
  for (const e of entries) {
    const changes = e?.changes || [];
    for (const c of changes) {
      const v = c?.value || {};

      // WhatsApp shapes
      const contacts = Array.isArray(v.contacts) ? v.contacts : [];
      const messages = Array.isArray(v.messages) ? v.messages : [];

      if (!messages.length) continue;

      // Who is the customer? who is the business number?
      const contactName = contacts[0]?.profile?.name || '';
      const contactWaId = contacts[0]?.wa_id || '';                 // e.g., "929967673820"
      const bizNumber = v?.metadata?.display_phone_number || '';  // e.g., "918329446654"

      for (const m of messages) {
        // sender is always present in your samples
        const sender = m.from;
        // If business sent it → receiver is the contact; else receiver is business
        const receiver = (sender === bizNumber) ? contactWaId : bizNumber;

        // Text body (if any)
        const text =
          m?.text?.body ??
          (typeof m?.text === 'string' ? m.text : '') ?? '';

        // Type (prefer explicit; else infer)
        const message_type =
          m?.type ??
          (m.image ? 'image'
            : m.audio ? 'audio'
              : m.document ? 'document'
                : m.video ? 'video'
                  : (text ? 'text' : 'unknown'));

        // Optional media blob (store minimal provider object)
        const media = m.image || m.audio || m.document || m.video || null;

        // WhatsApp timestamps are seconds → convert to JS Date
        const sent_at = m?.timestamp
          ? new Date(Number(m.timestamp) * 1000)
          : new Date();

        // WhatsApp's message id (wamid...) → we store as meta_msg_id (idempotency)
        const wamid = m?.id || null;

        out.push({
          // Participants (schema requires these)
          sender_wa_id: sender,
          receiver_wa_id: receiver,

          // Identity
          meta_msg_id: wamid,          // unique+sparse in schema
          external_id: wamid,          // optional convenience (same as wamid for now)

          // Content
          message_type,
          text,
          media,
          contact_name: contactName,   // purely for display

          // Domain timestamps
          sent_at,

          // Keep a slice of original for debugging/future fields
          provider_raw: { value: v, message: m },
        });
      }
    }
  }

  // keep only well-formed docs (must have ids + participants)
  return out.filter(d =>
    (d.meta_msg_id || d.external_id) &&
    d.sender_wa_id &&
    d.receiver_wa_id
  );
}


// Map WhatsApp "statuses" payloads (sent/delivered/read) → update instructions
export function toStatusUpdate(payload) {
  const out = [];
  const entries = payload?.metaData?.entry || [];

  for (const e of entries) {
    const changes = e?.changes || [];
    for (const c of changes) {
      const v = c?.value || {};
      const statuses = Array.isArray(v.statuses) ? v.statuses : [];
      for (const s of statuses) {
        // WhatsApp may use different keys; pick the first available
        const id =
          s?.id ||
          s?.meta_msg_id ||
          s?.message_id ||
          s?.wamid ||
          s?.mid ||
          null;

        // Map WA status to our enum
        const status = normalizeProviderStatus(s?.status || s?.delivery_status);
        if (!id || !status) continue;

        const at = s?.timestamp ? new Date(Number(s.timestamp) * 1000) : undefined;

        out.push({
          meta_msg_id: id,         // we update by meta_msg_id
          external_id: id,         // optional convenience
          status,                  // 'sent' | 'delivered' | 'read' | 'failed'
          at,                      // provider timestamp (service may use or ignore)
          provider_raw: s,         // keep original status event for audit/debug
        });
      }
    }
  }
  return out;
}

// Helper: convert provider statuses → our internal ones
function normalizeProviderStatus(st) {
  if (!st) return null;
  const x = String(st).toLowerCase();
  if (x === 'sent') return 'sent';
  if (x === 'delivered') return 'delivered';
  if (x === 'read') return 'read';
  if (x === 'failed' || x === 'undelivered' || x === 'error') return 'failed';
  // fallback (rare/provider-specific)
  return null;
}
