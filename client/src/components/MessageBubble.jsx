import { timeShort } from "../utils/date";
import StatusTick from "./StatusTick";

export default function MessageBubble({ msg }) {
  const mine = msg.direction === "out";
  const shownTime = msg.sent_at || msg.createdAt; // 👈 prefer WA time

  return (
    <div className={`w-full flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 mb-2 shadow-sm ${
          mine ? "bg-emerald-100 rounded-tr-sm" : "bg-white rounded-tl-sm"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words">
          {msg.text || "[media]"}
        </div>
        <div className="mt-1 text-[10px] text-gray-500 flex items-center justify-end">
          {timeShort(shownTime)}
          {mine && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  );
}
