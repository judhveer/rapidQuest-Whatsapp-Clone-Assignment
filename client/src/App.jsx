import { useEffect, useState } from "react";
import { getChats, getMessages } from "./api/chats";
import { sendMessage } from "./api/messages";
import Sidebar from "./components/Sidebar";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import InfoBar from "./components/InfoBar";
import socket from "./sockets/socket";





export default function App() {

  const [self] = useState(() => {
    const saved = localStorage.getItem("selfWaId");
    if (saved) return saved;
    // pick or set your own number here for this browser
    const pick = "919937320320";    // change per browser to simulate different users
    localStorage.setItem("selfWaId", pick);
    return pick;
  });

  // Put this above the component
  function normalizeMsg(msg, self) {
    // Prefer sender_wa_id/receiver_wa_id; never rely on `wa_id` for direction
    const direction = msg.sender_wa_id === self ? "out" : "in";
    return { ...msg, direction };
  }


  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  async function loadChats() {
    setLoadingChats(true);
    try {
      const c = await getChats(self);
      setChats(c);
      if (!active && c.length) setActive(c[0]);
    } finally { setLoadingChats(false); }
  }

  async function loadMessages(wa_id) {
    setLoadingMsgs(true);
    try {
      const data = await getMessages(self, wa_id);
      setMessages(data.map(m => normalizeMsg(m, self)));
    } finally { setLoadingMsgs(false); }
  }



  // after load (once)
  useEffect(() => {
    socket.emit('identify', self);
    loadChats();
    // eslint-disable-next-line
  }, [self]);

  useEffect(() => {
    if (active?.wa_id) {
      loadMessages(active.wa_id);
      socket.emit('chat:open', { self, peer: active.wa_id }); // auto-read on open
    }
    // eslint-disable-next-line
  }, [active?.wa_id, self]);

  // real-time listeners: append only if it belongs to this conversation
  useEffect(() => {
    function onNewMessage(msg) {
      const belongs = (msg.sender_wa_id && msg.receiver_wa_id)
        ? (
          (msg.sender_wa_id === self && msg.receiver_wa_id === active?.wa_id) ||
          (msg.receiver_wa_id === self && msg.sender_wa_id === active?.wa_id)
        )
        : (msg.wa_id === active?.wa_id);

      if (!belongs) return;

      // already added earlier: ignore your own echo
      if (msg.sender_wa_id === self) return;

      const normalized = normalizeMsg(msg, self);

      setMessages(prev => {
        if (normalized.clientMsgId) {
          const i = prev.findIndex(m => m._id === normalized.clientMsgId || m.clientMsgId === normalized.clientMsgId);
          if (i !== -1) {
            const next = prev.slice();
            next[i] = { ...prev[i], ...normalized };
            return next;
          }
        }
        if (normalized._id && prev.some(m => m._id === normalized._id)) return prev;
        return [...prev, normalized];
      });

      loadChats();
    }


    function onStatus(up) {
      setMessages(prev => prev.map(m => {
        const sameByMeta = up.meta_msg_id && m.meta_msg_id === up.meta_msg_id;
        const sameById = (up.id && (m.id === up.id || m._id === up.id))
          || (up._id && (m._id === up._id || m.id === up._id));
        if (sameByMeta || sameById) {
          return { ...m, status: up.status };
        }
        return m;
      }));
    }


    function onChatRead({ self: s, peer }) {
      if (s === self && peer === active?.wa_id) {
        // simplest: refresh messages to reflect read ticks
        loadMessages(active.wa_id);
        loadChats();
      }
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:status', onStatus);
    socket.on('chat:read', onChatRead);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:status', onStatus);
      socket.off('chat:read', onChatRead);
    };
    // eslint-disable-next-line
  }, [self, active?.wa_id]);


  async function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active?.wa_id) return;

    const clientMsgId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // optimistic
    const optimistic = {
      _id: clientMsgId,          // keep same as clientMsgId
      clientMsgId,               // correlation field
      sender_wa_id: self,
      receiver_wa_id: active.wa_id,
      wa_id: active.wa_id,
      contact_name: active.contact_name || "",
      direction: "out",
      message_type: "text",
      text,
      status: "sent",
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimistic]);
    setDraft("");

    try {
      // pass clientMsgId to server
      const saved = await sendMessage(self, active.wa_id, text, active.contact_name, clientMsgId);

      // optional: if your server returns the saved message right away, you can still do:
      setMessages(prev => prev.map(m =>
        m._id === clientMsgId ? normalizeMsg(saved, self) : m
      ));
      loadChats();
    } catch {
      setMessages(prev => prev.map(m => m._id === clientMsgId ? { ...optimistic, status: 'failed' } : m));
    }
  }


  return (
    <div className="w-screen h-screen bg-gray-200 flex">
      <Sidebar
        chats={chats}
        activeWaId={active?.wa_id}
        onSelect={(c) => setActive(c)}
      />

      <div className="flex-1 flex flex-col">
        <ChatHeader name={active?.contact_name} number={active?.wa_id} />
        {active && <InfoBar self={self} peerWaId={active.wa_id} peerName={active.contact_name} />}

        {loadingMsgs ? (
          <div className="flex-1 grid place-items-center text-gray-500">
            Loading messages...
          </div>
        ) : active ? (
          <MessageList messages={messages} />
        ) : (
          <div className="flex-1 grid place-items-center text-gray-500">
            Select a chat to start
          </div>
        )}

        <form onSubmit={handleSend} className="h-16 bg-gray-100 flex items-center gap-2 px-4">
          <textarea
            className="flex-1 bg-white rounded-full px-4 py-3 outline-none resize-none"
            rows={1}
            placeholder={active ? "Type a message" : "Select a chat to start"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();              // stops default form submit
                if (draft.trim()) handleSend(e); // manually send
              }
              // Shift+Enter falls through → inserts newline
            }}
            disabled={!active}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-emerald-600 text-white disabled:opacity-50"
            disabled={!active || !draft.trim()}
          >
            Send
          </button>
        </form>


      </div>
    </div>
  );
}
