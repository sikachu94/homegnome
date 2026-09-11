import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../Supabaseclient.js";
import { buildPlantSearchQuery, plantSearchLabel } from "../lib/plantSearch.js";

export function PlantSearch({ value, onChange }) {
  const [query, setQuery] = useState(value?.plant_name || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || value?.plant_name === query) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      const search = buildPlantSearchQuery(term);
      const { data, error: searchError } = await supabase
        .from("plants")
        .select("id, plant_name, latin_name, usda_symbol, usda_common_name")
        .ilike("plant_name", search.search)
        .order("plant_name")
        .limit(search.limit);
      if (id !== requestId.current) return;
      setLoading(false);
      if (searchError) {
        setError("Plant search is unavailable right now.");
        setResults([]);
        return;
      }
      setResults(data || []);
      setOpen(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, value]);

  const handleChange = (nextQuery) => {
    setQuery(nextQuery);
    if (value) onChange(null);
    setOpen(true);
  };

  const selectPlant = (plant) => {
    setQuery(plant.plant_name);
    setResults([]);
    setOpen(false);
    onChange(plant);
  };

  return (
    <div className="sg-plant-search">
      <div className="sg-plant-search-input">
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          placeholder="Search USDA plants"
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          aria-label="Search USDA plants"
          aria-autocomplete="list"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="sg-plant-search-results" role="listbox">
          {loading && <div className="sg-plant-search-status">Searching...</div>}
          {!loading && error && <div className="sg-plant-search-status">{error}</div>}
          {!loading && !error && results.length === 0 && <div className="sg-plant-search-status">No USDA plants found.</div>}
          {!loading && !error && results.map((plant) => (
            <button type="button" className="sg-plant-search-result" key={plant.id} onMouseDown={() => selectPlant(plant)} role="option">
              <strong>{plant.plant_name}</strong>
              <span>{plantSearchLabel(plant)}</span>
            </button>
          ))}
        </div>
      )}
      {value && <div className="sg-plant-search-selected">Selected: {plantSearchLabel(value)}</div>}
    </div>
  );
}