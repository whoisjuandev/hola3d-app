// Grams and print time estimated from a model's volume. Approximate on purpose: a slicer knows better.
import { normalizeSearch } from '../../../../shared/orders';

/** Density in g/cm³ by material, matched ignoring case and accents. */
export const DENSITIES: Record<string, number> = { pla: 1.24, petg: 1.27, abs: 1.04, asa: 1.07, tpu: 1.21, nylon: 1.14 };

/** For a material the table does not know: PLA's. */
export const DEFAULT_DENSITY = 1.24;

/** Share of the volume taken by walls, top and bottom layers; the infill fills the rest. */
export const SHELL_SHARE = 0.25;

/** The density of a material such as "PLA", "pla+ silk" or "PETG negro": the first word of it the table knows. */
export function densityOf(material: string): number {
  for (const word of normalizeSearch(material).split(/[^a-z0-9]+/)) {
    if (word in DENSITIES) return DENSITIES[word];
  }
  return DEFAULT_DENSITY;
}

/**
 * The share of the model's volume that gets printed: a fixed shell allowance plus the infill in the rest,
 * SHELL_SHARE + (1 − SHELL_SHARE) × infill % ÷ 100. 15 % gives 0.25 + 0.75 × 0.15 = 0.3625; 100 % gives 1.
 */
export function fillFactor(infillPercent: number): number {
  return SHELL_SHARE + (1 - SHELL_SHARE) * (infillPercent / 100);
}

export interface EstimateInput {
  volumeCm3: number;
  material: string;
  infillPercent: number; // 0 to 100
  gramsPerHour: number; // above 0
}

/**
 * grams = volume (cm³) × density × fill factor, rounded to whole grams;
 * minutes = those grams ÷ grams per hour × 60, rounded to whole minutes.
 * A model with volume never gives 0: at least 1 g and 1 min. It does not know supports, wall count or speeds.
 */
export function estimateFromVolume({ volumeCm3, material, infillPercent, gramsPerHour }: EstimateInput): { grams: number; minutes: number } {
  const grams = Math.max(1, Math.round(volumeCm3 * densityOf(material) * fillFactor(infillPercent)));
  const minutes = Math.max(1, Math.round((grams / gramsPerHour) * 60));
  return { grams, minutes };
}
