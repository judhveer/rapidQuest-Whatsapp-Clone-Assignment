// Given your payload shapes, "messages" live at metaData.entry[].changes[].value.messages[]
// display_phone_number is the business number; contacts[0].wa_id is the customer.

export function toInternalDocs(payload) {
  const out = [];
  const entries = payload?.metaData?.entry || [];
  for (const e of entries) {
    for (const c of (e?.changes || [])) {
      const v = c?.value || {};
      const contacts = Array.isArray(v.contacts) ? v.contacts : [];
      const messages = Array.isArray(v.messages) ? v.messages : [];
      if (!messages.length) continue;

      const contactName = contacts[0]?.profile?.name || '';
      const contactWaId  = contacts[0]?.wa_id || '';                 // e.g., Ravi
      const bizNumber    = v?.metadata?.display_phone_number || '';  // e.g., 918329446654

      for (const m of messages) {
        const sender = m.from;                                       // required in your samples
        // If sender is business → receiver is contact; else receiver is business
        const receiver = (sender === bizNumber) ? contactWaId : bizNumber;

        const text =
          m?.text?.body ??
          (typeof m?.text === 'string' ? m.text : '') ?? '';

        const message_type =
          m?.type ??
          (m.image ? 'image' : m.audio ? 'audio' : m.document ? 'document' : m.video ? 'video' : (text ? 'text' : 'unknown'));

        const media = m.image || m.audio || m.document || m.video || null;

        const sent_at = m?.timestamp
          ? new Date(Number(m.timestamp) * 1000)
          : new Date();

        const id = m?.id || null;

        out.push({
          // NEW
          sender_wa_id: sender,
          receiver_wa_id: receiver,

          // Legacy peer for compatibility (use the "other" person)
          wa_id: (sender === bizNumber) ? contactWaId : bizNumber,
          contact_name: (sender === bizNumber) ? contactName : contactName,

          // State/identity/content
          direction: 'in', // direction is recalculated per "self" later; keep as filler
          status: 'sent',
          meta_msg_id: id,
          id,
          message_type,
          text,
          media,
          sent_at
        });
      }
    }
  }

  return out.filter(d => (d.id || d.meta_msg_id) && d.sender_wa_id && d.receiver_wa_id);
}

export function toStatusUpdate(payload) {
  const out = [];
  const entries = payload?.metaData?.entry || [];
  for (const e of entries) {
    for (const c of (e?.changes || [])) {
      const v = c?.value || {};
      const statuses = Array.isArray(v.statuses) ? v.statuses : [];
      for (const s of statuses) {
        const id = s?.id || s?.meta_msg_id || s?.message_id || s?.wamid || s?.mid || null;
        const status = s?.status || s?.delivery_status || null;
        if (!id || !status) continue;

        out.push({
          meta_msg_id: id,
          id,
          status,
          timestamp: s?.timestamp ? new Date(Number(s.timestamp) * 1000) : undefined
        });
      }
    }
  }
  return out;
}
