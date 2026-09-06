import React, { useState } from "react";
import { Sprout, NotebookPen, MessageCircle, RotateCcw, MapPin, CloudRain, Thermometer, Loader2 } from "lucide-react";
import gnomeLogo from "./assets/gnome_only.jpg";
import "./styles.css";
import { useGardenData } from "./hooks/useGardenData.js";
import { useWeather } from "./hooks/useWeather.js";
import { PRESET_LOCATIONS } from "./lib/species.js";
import { CaptureTab } from "./components/CaptureTab.jsx";
import { PlantsTab } from "./components/PlantsTab.jsx";
import { ChatTab } from "./components/ChatTab.jsx";

export default function App() {
  const [tab, setTab] = useState("capture");
  const [resetKey, setResetKey] = useState(0);

  const {
    loaded, plantings, containers, events, garden,
    addEvent, addPlanting, addPlantingPhoto,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo: resetGardenData,
  } = useGardenData();

  const {
    weather, weatherError, locating,
    setGardenLocation, clearGardenLocation, useMyLocation,
    refresh: refreshWeather, reset: resetWeather,
  } = useWeather({ garden, events: events || [], addEvent, updateGardenAndPersist });

  const resetDemo = async () => {
    await resetGardenData();
    resetWeather();
    setResetKey((k) => k + 1);
  };

  if (!loaded) {
    return (
      <div className="sg-root sg-loading">
        <Loader2 className="spin" size={22} /><span>Loading your garden…</span>
      </div>
    );
  }

  return (
    <div className="sg-root">
      <header className="sg-header">
        <div className="sg-brand"><img src={gnomeLogo} alt="myGnomie logo" /><span>myGnomie</span></div>
        <button className="sg-reset" onClick={resetDemo} title="Reset demo data"><RotateCcw size={14} /> Reset demo</button>
      </header>

      {!garden?.location ? (
        <div className="sg-weatherbar setup">
          <span>Set your garden's location for weather-aware advice</span>
          <div className="sg-weather-actions">
            <button className="sg-secondary sm" onClick={useMyLocation} disabled={locating}>{locating ? <Loader2 className="spin" size={12} /> : <MapPin size={12} />} Use my location</button>
            {PRESET_LOCATIONS.map((loc) => <button key={loc.label} className="sg-chip" onClick={() => setGardenLocation(loc)}>{loc.label}</button>)}
          </div>
          {weatherError && <span className="sg-weather-err">{weatherError}</span>}
        </div>
      ) : (
        <div className="sg-weatherbar">
          <span className="sg-weather-loc"><MapPin size={13} /> {garden.label}</span>
          {weather ? (
            <span className="sg-weather-data"><Thermometer size={13} /> {Math.round(weather.current.temperature_2m)}°C <CloudRain size={13} /> {weather.daily.precipitation_sum[0]}mm today</span>
          ) : weatherError ? <span className="sg-weather-err">{weatherError}</span> : <span className="sg-weather-data"><Loader2 className="spin" size={12} /> Checking weather…</span>}
          <button className="sg-reset sm" onClick={refreshWeather}><RotateCcw size={12} /> Refresh</button>
          <button className="sg-reset sm" onClick={clearGardenLocation}>Change location</button>
        </div>
      )}

      <nav className="sg-tabs">
        <button className={tab === "capture" ? "active" : ""} onClick={() => setTab("capture")}><NotebookPen size={16} /> Log</button>
        <button className={tab === "plants" ? "active" : ""} onClick={() => setTab("plants")}><Sprout size={16} /> My garden</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageCircle size={16} /> Ask myGnomie</button>
      </nav>

      {/* All three tabs stay mounted (toggled with `hidden`, not unmounted via
          `&&`) so in-progress state -- the capture note/drafts, the chat
          thread, the add-planting form -- survives switching tabs, matching
          the original single-file behavior where this state lived in App. */}
      <main className="sg-main">
        <div hidden={tab !== "capture"}>
          <CaptureTab plantings={plantings} events={events} addEvent={addEvent} resetSignal={resetKey} />
        </div>
        <div hidden={tab !== "plants"}>
          <PlantsTab
            garden={garden} plantings={plantings} containers={containers} events={events}
            addPlanting={addPlanting} addPlantingPhoto={addPlantingPhoto}
            updateGardenLocal={updateGardenLocal} updateGardenAndPersist={updateGardenAndPersist} persistGarden={persistGarden}
          />
        </div>
        <div hidden={tab !== "chat"}>
          <ChatTab plantings={plantings} containers={containers} events={events} garden={garden} weather={weather} resetSignal={resetKey} />
        </div>
      </main>
    </div>
  );
}
