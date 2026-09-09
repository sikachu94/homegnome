import { useMemo, useState } from "react";
import { Search, Image as ImageIcon, LayoutGrid, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { groupByDay, fmtTime, fmtDate } from "../lib/format.js";
import { labelForEntity, labelForEventType } from "../lib/events.js";
import { EventIcon } from "./EventIcon.jsx";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  buildSubjectFacets,
  findOpenIssues,
  matchesFilters,
  clusterRoutineEvents,
  groupByPlant,
  groupByType,
} from "../lib/logFilters.js";

const GROUP_MODES = [
  { id: "day", label: "Day" },
  { id: "plant", label: "Plant" },
  { id: "type", label: "Type" },
];

function LogRow({ event, plantings, containers }) {
  return (
    <div className="sg-log-row">
      <span className="sg-log-dot" style={{ background: CATEGORY_COLORS[event.category] || "var(--muted)" }} />
      <EventIcon type={event.event_type} />
      <div className="sg-log-body">
        <div className="sg-log-title">
          {labelForEntity(event, plantings, containers)} · {labelForEventType(event.event_type)}
        </div>
        <div className="sg-log-meta">
          {fmtTime(event.timestamp)}
          {event.note ? ` — "${event.note}"` : ""}
        </div>
      </div>
      {event.media?.length ? <img className="sg-event-thumb" src={event.media[0]} alt="" /> : null}
    </div>
  );
}

function LogCluster({ cluster, expanded, onToggle, plantings, containers }) {
  const first = cluster.items[0];
  const last = cluster.items[cluster.items.length - 1];

  if (expanded) {
    return (
      <div className="sg-log-cluster expanded">
        <button className="sg-log-cluster-toggle" onClick={onToggle}>
          <ChevronUp size={12} /> Collapse
        </button>
        {cluster.items.map((item) => (
          <LogRow key={item.id} event={item} plantings={plantings} containers={containers} />
        ))}
      </div>
    );
  }

  return (
    <button className="sg-log-row sg-log-cluster-row" onClick={onToggle}>
      <span className="sg-log-dot" style={{ background: CATEGORY_COLORS[first.category] || "var(--muted)" }} />
      <EventIcon type={first.event_type} />
      <div className="sg-log-body">
        <div className="sg-log-title">
          {labelForEntity(first, plantings, containers)} · {cluster.items.length} {labelForEventType(first.event_type).toLowerCase()}
        </div>
        <div className="sg-log-meta">
          {fmtTime(last.timestamp)} – {fmtTime(first.timestamp)}
        </div>
      </div>
      <ChevronDown size={13} />
    </button>
  );
}

export function EventLog({ events, plantings, containers }) {
  const [subjectKey, setSubjectKey] = useState("all");
  const [category, setCategory] = useState("all");
  const [hasPhotoOnly, setHasPhotoOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState("day");
  const [density, setDensity] = useState("comfortable");
  const [expandedClusters, setExpandedClusters] = useState(() => new Set());

  const subjects = useMemo(() => buildSubjectFacets(events, plantings, containers), [events, plantings, containers]);

  const filtered = useMemo(() => {
    const filters = { subjectKey, category, hasPhoto: hasPhotoOnly, query };
    return [...events]
      .filter((e) => matchesFilters(e, filters, plantings, containers))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [events, subjectKey, category, hasPhotoOnly, query, plantings, containers]);

  // Open issues stay pinned regardless of category/search — the point is that
  // they surface even if that's not what you were browsing for — but they do
  // respect the subject filter, so filtering to one plant doesn't show every
  // other plant's alerts.
  const openIssues = useMemo(() => {
    const filters = { subjectKey, category: "all", hasPhoto: false, query: "" };
    return findOpenIssues(events).filter((e) => matchesFilters(e, filters, plantings, containers));
  }, [events, subjectKey, plantings, containers]);

  const toggleCluster = (key) =>
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItems = (items) =>
    clusterRoutineEvents(items).map((entry) =>
      entry.type === "cluster" ? (
        <LogCluster
          key={entry.key}
          cluster={entry}
          expanded={expandedClusters.has(entry.key)}
          onToggle={() => toggleCluster(entry.key)}
          plantings={plantings}
          containers={containers}
        />
      ) : (
        <LogRow key={entry.item.id} event={entry.item} plantings={plantings} containers={containers} />
      )
    );

  const groups =
    groupMode === "plant"
      ? groupByPlant(filtered, plantings, containers)
      : groupMode === "type"
        ? groupByType(filtered)
        : groupByDay(filtered).map((g) => ({ label: g.label, items: g.items }));

  const noResults = filtered.length === 0 && openIssues.length === 0;

  return (
    <div className={`sg-log ${density === "compact" ? "compact" : ""}`}>
      <div className="sg-log-toolbar">
        <div className="sg-log-search">
          <Search size={13} />
          <input
            placeholder="Search plant, note, or event type…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="sg-log-toggles">
          <div className="sg-segmented">
            {GROUP_MODES.map((m) => (
              <button key={m.id} className={groupMode === m.id ? "active" : ""} onClick={() => setGroupMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <button className="sg-chip" onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}>
            <LayoutGrid size={12} /> {density === "compact" ? "Comfortable" : "Compact"}
          </button>
        </div>
      </div>

      {subjects.length > 0 && (
        <div className="sg-log-chiprow">
          <button className={`sg-chip ${subjectKey === "all" ? "active" : ""}`} onClick={() => setSubjectKey("all")}>
            All plants
          </button>
          {subjects.map((s) => (
            <button
              key={s.key}
              className={`sg-chip ${subjectKey === s.key ? "active" : ""}`}
              onClick={() => setSubjectKey(s.key)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="sg-log-chiprow">
        <button className={`sg-chip ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}>
          All types
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`sg-chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
            <span className="sg-chip-dot" style={{ background: CATEGORY_COLORS[c] }} /> {CATEGORY_LABELS[c]}
          </button>
        ))}
        <button className={`sg-chip ${hasPhotoOnly ? "active" : ""}`} onClick={() => setHasPhotoOnly((v) => !v)}>
          <ImageIcon size={12} /> Has photo
        </button>
      </div>

      {openIssues.length > 0 && (
        <div className="sg-log-issues">
          <div className="sg-log-issues-head">
            <AlertTriangle size={13} /> Needs attention
          </div>
          {openIssues.map((e) => (
            <div key={e.id} className="sg-log-row sg-log-issue-row">
              <span className="sg-log-dot" style={{ background: CATEGORY_COLORS[e.category] || "var(--clay)" }} />
              <EventIcon type={e.event_type} />
              <div className="sg-log-body">
                <div className="sg-log-title">
                  {labelForEntity(e, plantings, containers)} · {labelForEventType(e.event_type)}
                </div>
                <div className="sg-log-meta">
                  {fmtDate(e.timestamp)}
                  {e.note ? ` — "${e.note}"` : ""}
                </div>
              </div>
              <span className="sg-log-unresolved">Unresolved</span>
            </div>
          ))}
        </div>
      )}

      <div className="sg-log-timeline">
        {noResults ? (
          <div className="sg-empty">
            {events.length === 0
              ? "Nothing logged yet. Write a note above to get started."
              : "No entries match your filters."}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="sg-day-group">
              <div className="sg-day-label sticky">{group.label}</div>
              {renderItems(group.items)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}