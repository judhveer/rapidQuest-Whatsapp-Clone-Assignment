export default function InfoBar({ self, peerWaId, peerName }) {
  return (
    <div className="px-4 py-2 text-xs bg-emerald-50 text-emerald-900 border-b border-emerald-100">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="font-semibold">You</span>: {self}</span>
        <span><span className="font-semibold">Talking to</span>: {peerName || peerWaId}</span>
        <span><span className="font-semibold">Chat ID</span>: {peerWaId}</span>
      </div>
    </div>
  );
}
