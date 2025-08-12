export default function ChatHeader({ name, number }) {
  return (
    <div className="h-14 px-4 bg-emerald-600 text-white flex items-center justify-between">
      <div className="font-medium">{name || number || "Select a chat"}</div>
      {number && <div className="opacity-80 text-xs">{number}</div>}
    </div>
  );
}
