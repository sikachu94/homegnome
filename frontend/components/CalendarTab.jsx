import { GardenCalendar } from "./GardenCalendar.jsx";

/**
 * Thin wrapper so Calendar sits in app.jsx's tab list like every other
 * top-level tab (mounted inside `.sg-panel` for the shared heading/spacing
 * rules). GardenCalendar owns its own "Garden calendar" heading, so this
 * component doesn't add a second one.
 *
 * The event-log browser (EventLog.jsx) isn't wired in yet — Calendar stands
 * alone as its own tab for now, rather than as a sub-view of a combined
 * history tab.
 */
export function CalendarTab({ plantings, events, calendarTasks, onUpdateTask, onCompleteTask }) {
    return (
        <section className="sg-panel">
            <GardenCalendar
                plantings={plantings}
                events={events}
                calendarTasks={calendarTasks}
                onUpdateTask={onUpdateTask}
                onCompleteTask={onCompleteTask}
            />
        </section>
    );
}