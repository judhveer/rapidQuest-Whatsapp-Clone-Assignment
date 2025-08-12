export function timeShort(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
