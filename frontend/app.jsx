import React, { useState } from "react";
import { Sprout, NotebookPen, MessageCircle, Calendar, RotateCcw, MapPin, CloudRain, Thermometer, Loader as Loader2 } from "lucide-react";
import gnomeLogo from "./assets/gnome_only.jpg";
import "./styles.css";
import { useGardenData } from "./hooks/useGardenData.js";
import { LandingPage } from "./components/LandingPage.jsx";
import { useWeather } from "./hooks/useWeather.js";
import { PRESET_LOCATIONS } from "./lib/species.js";
import { CaptureTab } from "./components/CaptureTab.jsx";
import { PlantsTab } from "./components/PlantsTab.jsx";
import { CalendarTab } from "./components/CalendarTab.jsx";
import { ChatTab } from "./components/ChatTab.jsx";
import { useToast, Toast } from "./lib/toast.jsx";

// Shorter labels for the bottom nav (mockup); top nav keeps the fuller labels
// on wider screens where there's room.
const TABS = [
  { id: "capture", icon: NotebookPen, shortLabel: "Log" },
  { id: "plants", icon: Sprout, shortLabel: "Garden" },
  { id: "calendar", icon: Calendar, shortLabel: "Calendar" },
  { id: "chat", icon: MessageCircle, shortLabel: "Ask" },
];

export default function App() {
  const [tab, setTab] = useState("capture");
  const [resetKey, setResetKey] = useState(0);
  const { toast, showToast } = useToast();
  const [showLanding, setShowLanding] = useState(true);

  const {
    loaded, loadError, plantings, containers, events, calendarTasks, garden, gardenId,
    addEvent, addPlanting, addPlantingPhoto,
    updateCalendarTask, completeCalendarTask,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo: resetGardenData, refresh: refreshGardenData,
  } = useGardenData();

  const {
    weather, weatherError, locating,
    setGardenLocation, clearGardenLocation, useMyLocation,
    refresh: refreshWeather, reset: resetWeather,
  } = useWeather({ garden, events: events || [], addEvent, updateGardenAndPersist });

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} />;
  }

  const resetDemo = async () => {
    try {
      await resetGardenData();
      resetWeather();
      setResetKey((k) => k + 1);
      showToast("Demo data reset.");
    } catch (err) {
      showToast("Couldn't reset demo data — try again.", "error");
    }
  };

  if (!loaded) {
    return (
      <div className="sg-root sg-loading">
        <Loader2 className="spin" size={22} /><span>Loading your garden…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sg-root sg-loading">
        <span className="sg-error">{loadError}</span>
        <button className="sg-secondary sm" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="sg-root">
      <Toast toast={toast} />

      <header className="sg-header">
        <div className="sg-brand"><img src={gnomeLogo} alt="myGnomie logo" /><span>myGnomie</span></div>
        <button className="sg-reset" onClick={resetDemo} title="Reset demo data" aria-label="Reset demo data">
          <RotateCcw size={14} />
        </button>
      </header>

      {!garden?.location ? (
        <div className="sg-weatherbar setup">
          <span>Set your garden's location for weather-aware advice</span>
          <div className="sg-weather-actions">
            <button className="sg-secondary sm" onClick={useMyLocation} disabled={locating} aria-label="Use my current location">
              {locating ? <Loader2 className="spin" size={12} /> : <MapPin size={12} />} Use my location
            </button>
            {PRESET_LOCATIONS.map((loc) => (
              <button key={loc.label} className="sg-chip" onClick={() => setGardenLocation(loc)}>{loc.label}</button>
            ))}
          </div>
          {weatherError && <span className="sg-weather-err">{weatherError}</span>}
        </div>
      ) : (
        <div className="sg-weatherbar">
          <span className="sg-weather-loc"><MapPin size={13} /> {garden.label}</span>
          {garden.hardiness_zone && <span className="sg-hardiness-badge">Zone {garden.hardiness_zone}</span>}
          {weather ? (
            <span className="sg-weather-data">
              <Thermometer size={13} /> {Math.round(weather.current.temperature_2m)}°C
              <CloudRain size={13} /> {weather.daily.precipitation_sum[0]}mm today
            </span>
          ) : weatherError ? (
            <span className="sg-weather-err">{weatherError}</span>
          ) : (
            <span className="sg-weather-data"><Loader2 className="spin" size={12} /> Checking weather…</span>
          )}
          <button className="sg-reset sm" onClick={refreshWeather} aria-label="Refresh weather">
            <RotateCcw size={12} />
          </button>
          <button className="sg-reset sm" onClick={clearGardenLocation} aria-label="Change garden location">
            Change
          </button>
        </div>
      )}


      {/* All tabs stay mounted (toggled with `hidden`, not unmounted via
          `&&`) so in-progress state -- the capture note/drafts, the chat
          thread, the add-planting form, the calendar's selected month/day --
          survives switching tabs. */}
      <main className="sg-main">
        <div hidden={tab !== "capture"}>
          <CaptureTab
            gardenId={gardenId} plantings={plantings} containers={containers} events={events}
            addEvent={addEvent} resetSignal={resetKey} showToast={showToast} weather={weather}
          />
        </div>
        <div hidden={tab !== "plants"}>
          <PlantsTab
            garden={garden} plantings={plantings} containers={containers} events={events}
            addPlanting={addPlanting} addPlantingPhoto={addPlantingPhoto} addEvent={addEvent}
            weather={weather}
            updateGardenLocal={updateGardenLocal} updateGardenAndPersist={updateGardenAndPersist}
            persistGarden={persistGarden} showToast={showToast}
          />
        </div>
        <div hidden={tab !== "calendar"}>
          <CalendarTab
            plantings={plantings} events={events}
            calendarTasks={calendarTasks} onUpdateTask={updateCalendarTask} onCompleteTask={completeCalendarTask}
          />
        </div>
        <div hidden={tab !== "chat"}>
          <ChatTab
            gardenId={gardenId} plantings={plantings} containers={containers} events={events}
            garden={garden} weather={weather} onGardenChanged={refreshGardenData} resetSignal={resetKey}
          />
        </div>
      </main>

      {/* Bottom nav: mobile only (CSS hides it above 640px, shows .sg-tabs instead) */}
      <nav className="sg-bottom-nav" aria-label="Primary">
        <div className="sg-bottom-nav-row">
          {TABS.map(({ id, icon: Icon, shortLabel }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              aria-label={shortLabel}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}