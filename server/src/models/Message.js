import mongoose from 'mongoose';

/** Message lifecycle */
export const MESSAGE_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
};

const StatusEnum = Object.values(MESSAGE_STATUS);

// forward-only transitions
function canTransition(from, to) {
  const order = [
    MESSAGE_STATUS.QUEUED,
    MESSAGE_STATUS.SENT,
    MESSAGE_STATUS.DELIVERED,
    MESSAGE_STATUS.READ,
  ];

  if (to == MESSAGE_STATUS.FAILED) {
    return true;
  }

  const i = order.indexOf(from);
  const j = order.indexOf(to);

  return i === -1 || j === -1 ? true : j >= i;
};

const MessageSchema = new mongoose.Schema({

  // ===== Participants (required) =====
  sender_wa_id: { type: String, index: true, required: true },  // who sent
  receiver_wa_id: { type: String, index: true, required: true },  // who received

  // Normalized A::B conversation key
  conversation_id: { type: String, index: true },

  // (Optional UI hint; best computed on client)
  direction: { type: String, enum: ['in', 'out'] },

  status: { type: String, enum: StatusEnum, default: MESSAGE_STATUS.SENT, index: true },

  // ===== Identity =====
  meta_msg_id: { type: String, index: true, unique: true, sparse: true }, // WhatsApp wamid...
  external_id: { type: String, index: true }, // provider-side alt id (renamed from 'id')


  // ===== Content =====
  message_type: { type: String, default: 'text' }, // WA 'type' (text/image/...)
  text: { type: String },
  media: { type: Object },        // image/audio/etc metadata
  contact_name: { type: String }, // display name (if you want)
  provider_raw: { type: Object }, // keep full original payload for debug/extension


  // ===== Domain timestamps =====
  sent_at: { type: Date },
  delivered_at: { type: Date },
  read_at: { type: Date },

},
  {
    timestamps: true,     // createdAt, updatedAt
    strict: true,     // safer; unknown fields won't slip in (provider_raw keeps originals)
    collection: 'processed_messages',
    toJSON: {
      virtuals: true,
      getters: false,
      transform: (_doc, ret) => {
        ret.id = String(ret._id);   // client-friendly id
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** Derived fields / defaults */
MessageSchema.pre('validate', function (next) {
  if (this.sender_wa_id && this.receiver_wa_id) {
    const [a, b] = [this.sender_wa_id, this.receiver_wa_id].sort();
    this.conversation_id = `${a}::${b}`;
  }
  if (!this.sent_at) this.sent_at = new Date();
  if (!this.meta_msg_id && this._id) this.meta_msg_id = String(this._id);
  next();
});

// ===== Indexes =====
MessageSchema.index({ conversation_id: 1, createdAt: -1 });                 // primary timeline
MessageSchema.index({ sender_wa_id: 1, receiver_wa_id: 1, createdAt: -1 }); // handy alt
MessageSchema.index({ receiver_wa_id: 1, status: 1, createdAt: -1 });       // unread/delivered queues

// ===== Status helpers (consistent + timestamped) =====
MessageSchema.statics.setStatus = async function setStatusByMeta(meta_msg_id, nextStatus) {
  const now = new Date();
  const doc = await this.findOne({ meta_msg_id }).select('status delivered_at read_at').lean();
  if (!doc) return { matched: 0, modified: 0 };
  if (!canTransition(doc.status, nextStatus)) {
    return { matched: 1, modified: 0, reason: 'no-backwards-transition' };
  }
  const $set = { status: nextStatus, updatedAt: now };
  if (nextStatus === MESSAGE_STATUS.DELIVERED && !doc.delivered_at) $set.delivered_at = now;
  if (nextStatus === MESSAGE_STATUS.READ && !doc.read_at) $set.read_at = now;

  const res = await this.updateOne({ meta_msg_id }, { $set });
  return { matched: res.matchedCount ?? res.matched, modified: res.modifiedCount ?? res.modified };
};

MessageSchema.statics.markDelivered = function (meta_msg_id) {
  return this.setStatus(meta_msg_id, MESSAGE_STATUS.DELIVERED);
};
MessageSchema.statics.markRead = function (meta_msg_id) {
  return this.setStatus(meta_msg_id, MESSAGE_STATUS.READ);
};

export const Message = mongoose.model('Message', MessageSchema);

