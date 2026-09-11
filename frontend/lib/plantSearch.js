export function buildPlantSearchQuery(value) {
  return { search: `%${value.trim()}%`, limit: 20 };
}

export function plantSearchLabel(plant) {
  return [plant.plant_name, plant.latin_name, plant.usda_symbol].filter(Boolean).join(" · ");
}