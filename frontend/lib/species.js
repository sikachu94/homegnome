export const PHENOPHASES = ["seed", "germinated", "seedling", "vegetative", "budding", "flowering", "fruiting", "seed_set", "senescent", "dormant", "mature"];
export const ACQUISITION = ["sown_self", "purchased_seedling", "gifted", "cutting", "division", "purchased_mature"];
export const CONTAINER_TYPES = ["pot", "raised_bed", "in_ground", "hanging_basket", "window_box", "vertical_planter", "grow_bag"];
export const CONTAINER_MATERIALS = ["terracotta", "plastic", "wood", "metal", "fabric", "ground"];
export const GARDEN_TYPES = ["balcony", "backyard", "rooftop", "indoor", "community_plot", "greenhouse"];

export const SPECIES_META = {
  Tomato: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 75, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Basil: { harvest_type: "leaf", life_cycle_type: "annual", sun_hours: [5, 7], water_frequency_days: 2, days_to_maturity: 60, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Lettuce: { harvest_type: "leaf", life_cycle_type: "annual", sun_hours: [4, 6], water_frequency_days: 2, days_to_maturity: 45, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Pepper: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 3, days_to_maturity: 70, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Cucumber: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 55, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Mint: { harvest_type: "leaf", life_cycle_type: "perennial", sun_hours: [3, 6], water_frequency_days: 2, days_to_maturity: 40, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Rosemary: { harvest_type: "leaf", life_cycle_type: "perennial", sun_hours: [6, 8], water_frequency_days: 5, days_to_maturity: 80, target_stage: "vegetative", flowering_signal: "neutral" },
  Strawberry: { harvest_type: "fruit", life_cycle_type: "perennial", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 60, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
};

export const PRESET_LOCATIONS = [
  { label: "New York, US", lat: 40.7128, lng: -74.0060 },
  { label: "Cairo, EG", lat: 30.0444, lng: 31.2357 },
  { label: "Barcelona, ES", lat: 41.3851, lng: 2.1775 },
];
