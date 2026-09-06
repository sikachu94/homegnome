export const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
export const daysBetween = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const formatComposition = (comp) => (comp && comp.length ? comp.map((c) => `${c.percent}% ${c.component}`).join(", ") : "Unspecified");

/**
 * Plain-language day heading for grouping a log — "Today", "Yesterday", or a
 * short weekday + date. Used to break the event list into scannable chunks
 * instead of one long undifferentiated list.
 */
export function dayGroupLabel(iso) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Groups a timestamp-sorted (newest-first) list into { label, items } buckets by day. */
export function groupByDay(items, getTimestamp = (item) => item.timestamp) {
  const groups = [];
  for (const item of items) {
    const label = dayGroupLabel(getTimestamp(item));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}