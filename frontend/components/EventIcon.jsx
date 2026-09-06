import { Droplets, Scissors, Bug, CloudRain, Snowflake, Camera, Sparkles } from "lucide-react";

export function EventIcon({ type }) {
  if (type === "watering") return <Droplets size={15} className="sg-evt-icon" />;
  if (type === "harvest") return <Scissors size={15} className="sg-evt-icon" />;
  if (type === "pest_sighting" || type === "disease_sighting") return <Bug size={15} className="sg-evt-icon" />;
  if (type === "rainfall") return <CloudRain size={15} className="sg-evt-icon" />;
  if (type === "frost") return <Snowflake size={15} className="sg-evt-icon" />;
  if (type === "photo_log") return <Camera size={15} className="sg-evt-icon" />;
  return <Sparkles size={15} className="sg-evt-icon" />;
}
