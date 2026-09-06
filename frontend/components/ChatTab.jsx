import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { apiChat } from "../api.js";
import { GARDEN_ID } from "../lib/seedData.js";
import { SPECIES_META } from "../lib/species.js";
import { projectPlanting, projectContainer } from "../lib/projections.js";
import { fmtDateTime, formatComposition } from "../lib/format.js";

export function ChatTab({ plantings, containers, events, garden, weather, resetSignal }) {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // Demo reset clears the thread, matching the original scope.
  useEffect(() => { setChatMessages([]); }, [resetSignal]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatting) return;
    const nextMessages = [...chatMessages, { role: "user", text }];
    setChatMessages(nextMessages); setChatInput(""); setChatting(true);
    try {
      const projections = plantings.map((p) => {
        const proj = projectPlanting(p, events);
        const cont = containers.find((c) => c.id === proj.container_id);
        const contState = projectContainer(cont, events);
        return `${p.nickname} (${p.species}, id ${p.id}): stage=${proj.stage}, status=${proj.status}, days_since_entry=${proj.days_since_entry}, last_watered=${proj.last_watered_at ? fmtDateTime(proj.last_watered_at) : "never logged"}, harvests=${proj.harvest_count}, container=${cont ? `${cont.type}/${cont.material}${cont.volume_l ? `/${cont.volume_l}L` : ""}, soil: ${formatComposition(contState.soil_composition)}, placement: ${contState.placement}` : "none recorded"}${proj.open_issue ? `, open_issue=${proj.open_issue.event_type} (${proj.open_issue.payload?.severity || ""} ${proj.open_issue.payload?.pest || proj.open_issue.payload?.disease || ""})` : ""}`;
      }).join("\n");
      const reference = plantings.map((p) => {
        const m = SPECIES_META[p.species];
        if (!m) return null;
        return `${p.species}: sun ${m.sun_hours[0]}-${m.sun_hours[1]}h/day, water every ~${m.water_frequency_days}d, ~${m.days_to_maturity}d to maturity, ready to harvest at "${m.target_stage}" stage, flowering means ${m.flowering_signal === "harvest_precondition" ? "on track" : m.flowering_signal === "decline_warning" ? "past its prime / bolting" : "not particularly meaningful"}.`;
      }).filter(Boolean).join("\n");
      const weatherSummary = garden?.location
        ? weather ? `Location: ${garden.label}. Current ${Math.round(weather.current.temperature_2m)}°C, ${weather.daily.precipitation_sum[0]}mm rain forecast today, low ${Math.round(weather.daily.temperature_2m_min[0])}°C / high ${Math.round(weather.daily.temperature_2m_max[0])}°C.` : "Location is set but weather hasn't loaded yet."
        : "No location set for this garden yet — weather isn't available.";
      const gardenSummary = `${garden?.name || "This garden"} (${garden?.type || "unspecified type"})${garden?.notes ? ` — notes: ${garden.notes}` : ""}. ${plantings.length} plantings across ${containers.length} containers.`;

      // Deliberately no "recent event log" section here: api/chat.py fetches
      // the last 20 garden_events fresh from Supabase itself and appends
      // them to the system prompt server-side. This context string only
      // carries what the backend has no way to see on its own — weather,
      // client-side projections, and species reference data.
      const context = `GARDEN
${gardenSummary}

CURRENT PLANTINGS (including their container & soil)
${projections}

REFERENCE (ideal conditions)
${reference}

CURRENT WEATHER
${weatherSummary}`;

      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.text }));
      const res = await apiChat(GARDEN_ID, apiMessages, context);
      setChatMessages((ms) => [...ms, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setChatMessages((ms) => [...ms, { role: "assistant", text: "Something went wrong reaching the assistant — try again in a moment." }]);
    } finally { setChatting(false); }
  };

  return (
    <section className="sg-panel sg-chat-panel">
      <h1>Ask myGnomie</h1>
      <p className="sg-sub">He can help you manage your garden!</p>
      <div className="sg-chat-thread">
        {chatMessages.length === 0 && <div className="sg-chat-empty">Try: "Is my tomato's soil okay?" or "Should I water today given the weather?"</div>}
        {chatMessages.map((m, i) => <div key={i} className={`sg-chat-msg ${m.role}`}>{m.text}</div>)}
        {chatting && <div className="sg-chat-msg assistant"><Loader2 className="spin" size={14} /></div>}
        <div ref={chatEndRef} />
      </div>
      <div className="sg-chat-input">
        <input placeholder="Ask about a plant, get a reminder, or plan next steps…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} />
        <button className="sg-primary" disabled={!chatInput.trim() || chatting} onClick={sendChat}>Send</button>
      </div>
    </section>
  );
}
