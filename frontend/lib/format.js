export const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
export const daysBetween = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const formatComposition = (comp) => (comp && comp.length ? comp.map((c) => `${c.percent}% ${c.component}`).join(", ") : "Unspecified");
