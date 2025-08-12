import { timeShort } from "../utils/date";

export default function ChatItem({ chat, active, onClick }) {
  const last = chat.lastMessage || {};
  const initials = (chat.contact_name || chat.wa_id || "")
    .toString()
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 ${
        active ? "bg-gray-100" : ""
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center font-semibold">
        {initials}
      </div>
      <div className="flex-1 text-left">
        <div className="flex justify-between">
          <div className="font-medium">{chat.contact_name || chat.wa_id}</div>
          <div className="text-xs text-gray-500">
            {last.createdAt ? timeShort(last.createdAt) : ""}
          </div>
        </div>
        <div className="text-sm text-gray-600 truncate">
          {last.direction === "out" ? "You: " : ""}
          {last.text || "[media]"}
        </div>
      </div>
      {chat.unread > 0 && (
        <div className="min-w-6 h-6 text-xs rounded-full bg-emerald-500 text-white px-2 grid place-items-center">
          {chat.unread}
        </div>
      )}
    </button>
  );
}
