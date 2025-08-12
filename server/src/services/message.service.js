import { Message } from '../models/Message.js';

export async function insertIncomingOrOutgoing(doc) {
  if (doc.meta_msg_id) {
    const exists = await Message.findOne({ meta_msg_id: doc.meta_msg_id });
    if (exists) return exists;
  }
  const created = await Message.create(doc);
  return created;
}

export async function updateStatusByMetaOrId({ meta_msg_id, id, status, stampField, at }) {
  const query = meta_msg_id ? { meta_msg_id } : { id };
  const $set = { status };
  if (stampField) $set[stampField] = at || new Date();
  return Message.findOneAndUpdate(query, { $set }, { new: true });
}


/** Legacy chat heads (older docs without sender/receiver) */
export async function findChatHeads() {
  const pipeline = [
    { $match: { wa_id: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$wa_id',
        lastMessage: { $first: '$$ROOT' },
        contact_name: { $first: '$contact_name' },
        unread: {
          $sum: {
            $cond: [
              { $and: [ { $eq: ['$direction','in'] }, { $ne: ['$status','read'] } ] },
              1, 0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        wa_id: '$_id',
        contact_name: 1,
        lastMessage: {
          text: '$lastMessage.text',
          status: '$lastMessage.status',
          createdAt: '$lastMessage.createdAt',
          direction: '$lastMessage.direction'
        },
        unread: 1
      }
    },
    { $sort: { 'lastMessage.createdAt': -1 } }
  ];
  return Message.aggregate(pipeline);
}



/** Legacy messages for older docs */
export async function findMessagesByWaId(wa_id, { limit = 50, before } = {}) {
  const query = { wa_id };
  if (before) query.createdAt = { $lt: new Date(before) };
  const docs = await Message.find(query).sort({ createdAt: 1 }).limit(Number(limit) || 50).lean();
  return docs;
}

/** Multi-user chat heads for the current user ("self") */
export async function findChatHeadsForSelf(self) {
  const pipeline = [
    { $match: { $or: [ { sender_wa_id: self }, { receiver_wa_id: self } ] } },
    { $sort: { createdAt: -1 } },
    {
      $addFields: {
        peer: { $cond: [{ $eq: ['$sender_wa_id', self] }, '$receiver_wa_id', '$sender_wa_id'] }
      }
    },
    {
      $group: {
        _id: '$peer',
        lastMessage: { $first: '$$ROOT' },
        unread: {
          $sum: {
            $cond: [
              { $and: [ { $eq: ['$receiver_wa_id', self] }, { $ne: ['$status','read'] } ] },
              1, 0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        wa_id: '$_id',
        contact_name: '$lastMessage.contact_name',
        lastMessage: {
          text: '$lastMessage.text',
          status: '$lastMessage.status',
          createdAt: '$lastMessage.createdAt',
          direction: { $cond: [{ $eq: ['$lastMessage.sender_wa_id', self] }, 'out', 'in'] }
        },
        unread: 1
      }
    },
    { $sort: { 'lastMessage.createdAt': -1 } }
  ];
  return Message.aggregate(pipeline);
}

/** Messages between self and peer (chronological) */
export async function findMessagesBetween(self, peer, { limit = 50, before } = {}) {
  const query = {
    $or: [
      { sender_wa_id: self, receiver_wa_id: peer },
      { sender_wa_id: peer, receiver_wa_id: self }
    ]
  };
  if (before) query.createdAt = { $lt: new Date(before) };
  const docs = await Message.find(query).sort({ createdAt: 1 }).limit(Number(limit) || 50).lean();
  return docs.map(d => ({ ...d, direction: d.sender_wa_id === self ? 'out' : 'in' }));
}

