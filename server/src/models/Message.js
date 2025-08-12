import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    // Multi-user simulation (new)
    sender_wa_id:   { type: String, index: true }, // who sent
    receiver_wa_id: { type: String, index: true }, // who received

    // Legacy compatibility (keep)
    wa_id: { type: String, index: true }, // peer id used by older UI paths
    contact_name: { type: String },

    // Message state
    direction: { type: String, enum: ['in','out'] }, // UI convenience; computed relative to "self"
    status: { type: String, enum: ['queued','sent','delivered','read','failed'], default: 'sent', index: true },

    // Identity
    meta_msg_id: { type: String, index: true, unique: true, sparse: true },
    id: { type: String, index: true },

    // Content
    message_type: { type: String, default: 'text' },
    text: { type: String },
    media: { type: Object },

    // Timestamps
    sent_at: { type: Date },
    delivered_at: { type: Date },
    read_at: { type: Date },
  },
  { timestamps: true, strict: false, collection: 'processed_messages' }
);

MessageSchema.index({ sender_wa_id: 1, receiver_wa_id: 1, createdAt: -1 });
MessageSchema.index({ wa_id: 1, createdAt: -1 });

export const Message = mongoose.model('Message', MessageSchema);
