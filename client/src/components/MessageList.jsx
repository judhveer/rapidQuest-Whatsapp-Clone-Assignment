import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";

export default function MessageList({ messages }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const keyFor = (m) => m.meta_msg_id || m.external_id || m.id || m._id; // 👈 stable order

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50">
      {messages.map((m) => (
        <MessageBubble key={keyFor(m)} msg={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
