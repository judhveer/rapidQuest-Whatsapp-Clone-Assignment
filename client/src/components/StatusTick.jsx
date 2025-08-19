export default function StatusTick({ status }) {
  if (!status) return null;
  if (status === "queued")    return <span className="ml-1 text-[10px]">⌛</span>;
  if (status === "sent")      return <span className="ml-1 text-[10px]">✓</span>;
  if (status === "delivered") return <span className="ml-1 text-[10px]">✓✓</span>;
  if (status === "read")      return <span className="ml-1 text-[10px] text-blue-500">✓✓</span>;
  if (status === "failed")    return <span className="ml-1 text-[10px] text-red-500">✗</span>;
  return null;
}
