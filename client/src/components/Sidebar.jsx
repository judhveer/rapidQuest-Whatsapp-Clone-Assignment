import ChatItem from "./ChatItem";

export default function Sidebar({ chats, activePeerWaId, onSelect }) {
  return (
    <div className="w-full md:w-[360px] border-r h-full flex flex-col bg-white">
      <div className="h-14 px-4 bg-emerald-700 text-white flex items-center font-semibold">
        WhatsApp Demo
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No chats found.</div>
        ) : (
          chats.map((c) => (
            <ChatItem
              key={c.peer_wa_id}
              chat={c}
              active={c.peer_wa_id === activePeerWaId}
              onClick={() => onSelect(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}
