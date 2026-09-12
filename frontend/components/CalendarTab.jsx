import { GardenCalendar } from "./GardenCalendar.jsx";

export function CalendarTab({ plantings, events, calendarTasks, onUpdateTask, onCompleteTask, onSelectPlanting }) {
    return (
        <section className="sg-panel">
            <GardenCalendar
                plantings={plantings}
                events={events}
                calendarTasks={calendarTasks}
                onUpdateTask={onUpdateTask}
                onCompleteTask={onCompleteTask}
                onSelectPlanting={onSelectPlanting}
            />
        </section>
    );
}