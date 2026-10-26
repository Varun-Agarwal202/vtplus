/**
 * Research model: propranolol dose–response as a Hill curve, with and without
 * vibrotactile stimulation (VTS), following the simulation in the VibroTremor+
 * paper ("Closed-Loop Vibrotactile Desynchronization of Pathological Tremor:
 * Reducing Modeled Propranolol Requirements").
 *
 *   tremor reduction  R(D) = Emax · Dⁿ / (ED50ⁿ + Dⁿ)
 *   blood-pressure drop  B(D) = Bmax · Dᵐ / (EC50ᵐ + Dᵐ)      (mmHg)
 *
 * VTS is treated as an independent, multiplicative reduction, so the combined
 * effect is  1 − (1 − vts)(1 − R(D)).
 *
 * The paper reports: without VTS, 320 mg/day reaches a 50 % reduction with a
 * 38.1 mmHg modeled BP drop; with closed-loop VTS (48.78 % on its own) the same
 * 50 % target needs 90 mg/day with an 18.9 mmHg drop. The curve constants below
 * are solved from exactly those four anchor values (plus a fixed ceiling for
 * each curve), so the model reproduces the paper's headline numbers. If the
 * project's `hill_curve.py` supplies fitted coefficients, replace `PARAMS`.
 *
 * This is a simulation of published, modeled figures from a two-subject study.
 * It is not a prescription, a dosing recommendation, or medical advice; the UI
 * says so wherever the output is shown.
 */

export interface HillCurve {
  emax: number;
  ec50: number;
  n: number;
}

export interface HillParams {
  tremor: HillCurve;
  bloodPressure: HillCurve;
  /** fractional tremor reduction from VTS alone */
  vts: { constant: number; closedLoop: number };
  /** highest dose the model is allowed to report (mg/day) */
  maxDoseMg: number;
  /** doses are reported rounded to this step (mg) */
  doseStepMg: number;
}

export const PAPER_ANCHORS = {
  vtsClosedLoop: 0.4878,
  vtsConstant: 0.373,
  target: 0.5,
  withoutVts: { doseMg: 320, bpDropMmHg: 38.1 },
  withVts: { doseMg: 90, bpDropMmHg: 18.9 },
  /** assumed ceilings (not stated in the paper) */
  tremorEmax: 0.65,
  bpMax: 60,
} as const;

/**
 * Solve a Hill curve through two (dose, effect) points for a given ceiling.
 * With u = (D₁/EC50)ⁿ and v = (D₂/EC50)ⁿ the two equations give
 *   n = ln(v/u) / ln(D₂/D₁),  EC50 = D₁ / u^(1/n).
 */
export function solveHill(emax: number, p1: { dose: number; effect: number }, p2: { dose: number; effect: number }): HillCurve {
  const u = p1.effect / (emax - p1.effect);
  const v = p2.effect / (emax - p2.effect);
  const n = Math.log(v / u) / Math.log(p2.dose / p1.dose);
  const ec50 = p1.dose / Math.pow(u, 1 / n);
  return { emax, ec50, n };
}

function calibrate(): HillParams {
  const a = PAPER_ANCHORS;
  // propranolol alone must supply the part of the 50 % target that VTS does not
  const residualWithVts = 1 - (1 - a.target) / (1 - a.vtsClosedLoop);
  return {
    tremor: solveHill(a.tremorEmax, { dose: a.withVts.doseMg, effect: residualWithVts }, { dose: a.withoutVts.doseMg, effect: a.target }),
    bloodPressure: solveHill(a.bpMax, { dose: a.withVts.doseMg, effect: a.withVts.bpDropMmHg }, { dose: a.withoutVts.doseMg, effect: a.withoutVts.bpDropMmHg }),
    vts: { constant: a.vtsConstant, closedLoop: a.vtsClosedLoop },
    maxDoseMg: 320,
    doseStepMg: 10,
  };
}

export const PARAMS: HillParams = calibrate();

export function hill(c: HillCurve, dose: number): number {
  if (dose <= 0) return 0;
  const dn = Math.pow(dose, c.n);
  return (c.emax * dn) / (Math.pow(c.ec50, c.n) + dn);
}

/** Inverse Hill: dose that produces `effect`, or Infinity when effect ≥ emax. */
export function hillInverse(c: HillCurve, effect: number): number {
  if (effect <= 0) return 0;
  if (effect >= c.emax) return Infinity;
  return c.ec50 * Math.pow(effect / (c.emax - effect), 1 / c.n);
}

export type VtsMode = 'none' | 'constant' | 'closedLoop';

export interface DoseEstimate {
  vts: VtsMode;
  /** fractional reduction VTS contributes on its own */
  vtsReduction: number;
  /** fractional reduction propranolol must contribute */
  drugReduction: number;
  /** exact dose from the inverse curve (mg/day), Infinity when unreachable */
  doseExactMg: number;
  /** dose rounded to the step, capped at maxDoseMg; null when unreachable within the cap */
  doseMg: number | null;
  /** true when the target cannot be reached within maxDoseMg */
  beyondRange: boolean;
  /** modeled BP drop at `doseMg` (or at the cap when beyond range) */
  bpDropMmHg: number;
  /** total modeled reduction actually achieved at the reported dose */
  achievedReduction: number;
}

export function estimateDose(targetReduction: number, vts: VtsMode, params: HillParams = PARAMS): DoseEstimate {
  const vtsReduction = vts === 'none' ? 0 : vts === 'constant' ? params.vts.constant : params.vts.closedLoop;
  const target = Math.max(0, Math.min(0.99, targetReduction));
  // 1 − (1 − vts)(1 − r) = target  ⇒  r = 1 − (1 − target)/(1 − vts)
  const drugReduction = Math.max(0, 1 - (1 - target) / (1 - vtsReduction));
  const doseExactMg = hillInverse(params.tremor, drugReduction);
  const step = params.doseStepMg;
  const rounded = Number.isFinite(doseExactMg) ? Math.round(doseExactMg / step) * step : Infinity;
  const beyondRange = !(rounded <= params.maxDoseMg);
  const reported = beyondRange ? params.maxDoseMg : rounded;
  const achievedDrug = hill(params.tremor, reported);
  return {
    vts,
    vtsReduction,
    drugReduction,
    doseExactMg,
    doseMg: beyondRange ? null : rounded,
    beyondRange,
    bpDropMmHg: hill(params.bloodPressure, reported),
    achievedReduction: 1 - (1 - vtsReduction) * (1 - achievedDrug),
  };
}

/** Points for drawing the two dose–response curves (0..maxDose). */
export function curvePoints(vts: VtsMode, params: HillParams = PARAMS, steps = 64): { dose: number; reduction: number; bpDrop: number }[] {
  const vtsReduction = vts === 'none' ? 0 : vts === 'constant' ? params.vts.constant : params.vts.closedLoop;
  const out: { dose: number; reduction: number; bpDrop: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const dose = (params.maxDoseMg * i) / steps;
    out.push({ dose, reduction: 1 - (1 - vtsReduction) * (1 - hill(params.tremor, dose)), bpDrop: hill(params.bloodPressure, dose) });
  }
  return out;
}

/** Reduction needed to bring `rmsG` down to `targetRmsG`, clamped to [0, 0.95]. */
export function reductionToReach(rmsG: number, targetRmsG: number): number {
  if (!(rmsG > 0)) return 0;
  return Math.max(0, Math.min(0.95, 1 - targetRmsG / rmsG));
}

export const MODEL_DISCLAIMER = 'Estimate only, not medical advice. Ask your doctor before changing any medication.';
