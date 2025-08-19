import { useEffect, useState, useRef } from "react";
import { getChats, getMessages } from "./api/chats";
import { sendMessage } from "./api/messages";
import Sidebar from "./components/Sidebar";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import InfoBar from "./components/InfoBar";
import socket from "./sockets/socket";

export default function App() {
  // Sim users for different tabs/browsers
  const waIds = ["919937320320", "919812345678", "919765432109"];

  const [self] = useState(() => {
    const saved = localStorage.getItem("selfWaId");
    if (saved) return saved;

    const assignedCount = parseInt(localStorage.getItem("waIdAssignedCount") || "0", 10);
    const pick = waIds[assignedCount % waIds.length];

    localStorage.setItem("selfWaId", pick);
    localStorage.setItem("waIdAssignedCount", assignedCount + 1);
    return pick;
  });

  // Compute direction on the client (never rely on wa_id)
  function normalizeMsg(msg, self) {
    const direction = msg.sender_wa_id === self ? "out" : "in";
    return { ...msg, direction };
  }

  // Robust matcher for status updates (works with meta_msg_id/external_id/_id)
  function matchesUpdate(m, up) {
    if (up.meta_msg_id && m.meta_msg_id && up.meta_msg_id === m.meta_msg_id) return true;
    if (up.external_id && m.external_id && up.external_id === m.external_id) return true;
    if (up._id && (m._id === up._id || m.external_id === up._id)) return true;
    if (up.id && (m.external_id === up.id || m._id === up.id)) return true; // legacy fallback
    return false;
  }

  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null); // active chat object: { peer_wa_id, contact_name, ... }
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  // track currently-open chat peer in a ref so listeners don't need re-binding
  const activePeerRef = useRef(null);
  useEffect(() => {
    activePeerRef.current = active?.peer_wa_id || null;
  }, [active?.peer_wa_id]);

  async function loadChats() {
    setLoadingChats(true);
    try {
      const c = await getChats(self);
      setChats(c);

      // Reconcile selection using the latest state (no stale closure)
      setActive(prev => {
        // If nothing selected yet, pick the first chat (initial load only)
        if (!prev) return c[0] || null;

        // Try to keep the same peer selected even if the array was recreated/re-ordered
        const match = c.find(x => x.peer_wa_id === prev.peer_wa_id);
        return match || prev; // keep previous object if not found
      });
    } finally {
      setLoadingChats(false);
    }
  }


  async function loadMessages(peer_wa_id) {
    setLoadingMsgs(true);
    try {
      // NEW: server expects /api/chats/:peer_wa_id/messages?self=...
      const data = await getMessages(self, peer_wa_id);
      setMessages(data.map((m) => normalizeMsg(m, self)));
    } finally {
      setLoadingMsgs(false);
    }
  }

  // identify this tab/user + load chats
  useEffect(() => {
    socket.emit("identify", self);
    loadChats();
    // eslint-disable-next-line
  }, [self]);

  // when active chat changes, load that convo and tell server "chat open"
  useEffect(() => {
    if (active?.peer_wa_id) {
      socket.emit("chat:open", { self, peer: active.peer_wa_id }); // server will bulk-mark read + emit precise ids
      loadMessages(active.peer_wa_id);
    }
    // eslint-disable-next-line
  }, [active?.peer_wa_id, self]);

  // realtime listeners
  useEffect(() => {
    function onNewMessage(msg) {
      // Is this message relevant to me at all?
      const relevant = (msg.sender_wa_id === self) || (msg.receiver_wa_id === self);
      if (!relevant) return;

      // Is it for the currently open conversation? (read from ref, no rebind)
      const openPeer = activePeerRef.current;
      const belongs =
        (msg.sender_wa_id === self && msg.receiver_wa_id === openPeer) ||
        (msg.receiver_wa_id === self && msg.sender_wa_id === openPeer);



      // ignore echo of my own outgoing (I'll already have optimistic)
      if (msg.sender_wa_id === self) return;

      if (belongs) {
        const normalized = normalizeMsg(msg, self);
        setMessages((prev) => {
          if (normalized.clientMsgId) {
            const i = prev.findIndex(
              (m) => m._id === normalized.clientMsgId || m.clientMsgId === normalized.clientMsgId
            );
            if (i !== -1) {
              const next = prev.slice();
              next[i] = { ...prev[i], ...normalized };
              return next;
            }
          }
          if (normalized._id && prev.some((m) => m._id === normalized._id)) return prev;
          return [...prev, normalized];
        });
      }

      // Always refresh chat heads (unread count, last message) for relevant new messages
      loadChats();
    }

    function onStatus(up) {
      setMessages((prev) =>
        prev.map((m) => {
          if (matchesUpdate(m, up)) {
            return {
              ...m,
              status: up.status,
              delivered_at: up.delivered_at ?? m.delivered_at,
              read_at: up.read_at ?? m.read_at,
            };
          }
          return m;
        })
      );
      // Status changes can affect unread counts / lastMessage in the sidebar
      loadChats();
    }

    // NEW: precise bulk read/delivered updates
    function onStatusBulk({ ids = [], status, read_at, delivered_at }) {
      if (!ids.length) return;
      setMessages((prev) =>
        prev.map((m) => {
          const mid = m.meta_msg_id || m._id || m.external_id;
          if (ids.includes(mid)) {
            return {
              ...m,
              status,
              read_at: read_at ?? m.read_at,
              delivered_at: delivered_at ?? m.delivered_at,
            };
          }
          return m;
        })
      );
      // bulk events also change unread/lastMessage in sidebar
      loadChats();
    }

    socket.on("message:new", onNewMessage);
    socket.on("message:status", onStatus);
    socket.on("message:status:bulk", onStatusBulk);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("message:status", onStatus);
      socket.off("message:status:bulk", onStatusBulk);
    };
    // eslint-disable-next-line
  }, [self]);

  async function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active?.peer_wa_id) return;

    const clientMsgId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // optimistic add
    const optimistic = {
      _id: clientMsgId, // key to swap with server copy later
      clientMsgId,
      sender_wa_id: self,
      receiver_wa_id: active.peer_wa_id,
      contact_name: active.contact_name || "",
      direction: "out",
      message_type: "text",
      text,
      status: "sent",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      // NEW: API shape = { self, peer, text, contact_name?, clientMsgId? }
      const saved = await sendMessage(self, active.peer_wa_id, text, active.contact_name, clientMsgId);

      setMessages((prev) =>
        prev.map((m) => (m._id === clientMsgId ? normalizeMsg(saved, self) : m))
      );
      loadChats();
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m._id === clientMsgId ? { ...optimistic, status: "failed" } : m))
      );
    }
  }

  return (
    <div className="w-screen h-screen bg-gray-200 flex">
      <Sidebar
        chats={chats}
        activePeerWaId={active?.peer_wa_id}
        onSelect={(c) => setActive(c)}
      />

      <div className="flex-1 flex flex-col">
        <ChatHeader name={active?.contact_name} number={active?.peer_wa_id} />
        {active && (
          <InfoBar self={self} peerWaId={active.peer_wa_id} peerName={active.contact_name} />
        )}

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
                e.preventDefault();
                if (draft.trim()) handleSend(e);
              }
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
