import type { Units } from '@/db/settings';

/** Standard gravity, used for g <-> m/s² conversion. */
export const G = 9.80665;

export const UNIT_LABEL: Record<Units, string> = { g: 'g', ms2: 'm/s²' };

/** Convert an acceleration stored in g to the display unit. */
export function fromG(valueG: number, units: Units): number {
  return units === 'g' ? valueG : valueG * G;
}

/** Convert a power value stored in g² to the display unit squared. */
export function powerFromG(valueG2: number, units: Units): number {
  return units === 'g' ? valueG2 : valueG2 * G * G;
}

export function formatAccel(valueG: number, units: Units, digits?: number): string {
  const v = fromG(valueG, units);
  const d = digits ?? (units === 'g' ? 4 : 3);
  return `${v.toFixed(d)} ${UNIT_LABEL[units]}`;
}

export function formatAccelValue(valueG: number, units: Units, digits?: number): string {
  const v = fromG(valueG, units);
  const d = digits ?? (units === 'g' ? 4 : 3);
  return v.toFixed(d);
}

export function formatHz(hz: number, digits = 2): string {
  return `${hz.toFixed(digits)} Hz`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Signed relative change as a short string, e.g. "+12%" / "−5%" / "no change". */
export function formatChange(current: number, previous: number): string {
  if (!(previous > 0)) return '—';
  const rel = (current - previous) / previous;
  if (Math.abs(rel) < 0.005) return 'no change';
  const sign = rel > 0 ? '+' : '−';
  return `${sign}${Math.abs(rel * 100).toFixed(0)}%`;
}
