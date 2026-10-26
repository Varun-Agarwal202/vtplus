/**
 * Clinician summary: an HTML document rendered to PDF with expo-print.
 * Self-tracked, non-diagnostic. Neutral wording only (amplitude, dominant
 * frequency, change); nothing here comments on medication or severity.
 */
import type { Units } from '@/db/settings';
import { POSITION_LABEL, POSITIONS, type Position, type Session } from '@/db/types';
import { QUALITY_FLAG_LABEL, formatDate, formatDateTime, mean, median } from '@/lib/format';
import { UNIT_LABEL, fromG } from '@/lib/units';

export const DISCLAIMER_SENTENCE =
  'This app tracks movement and is not a medical device. It does not diagnose or treat any condition and does not provide medical advice. Talk to your doctor about your symptoms and medications.';

export interface SummaryInput {
  sessions: Session[];
  units: Units;
  rangeLabel: string;
  appVersion: string;
  deviceModel: string | null;
}

const POSITION_COLOR: Record<Position, string> = {
  rest: '#0E7C86',
  postural: '#C2410C',
  kinetic: '#6D28D9',
};

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface SeriesPoint {
  t: number;
  v: number;
}

/** Minimal multi-series line chart as an inline SVG string. */
function svgChart(
  series: { label: string; color: string; points: SeriesPoint[] }[],
  opts: { width: number; height: number; yLabel: string; yMin?: number; yMax?: number },
): string {
  const { width, height } = opts;
  const pad = { l: 56, r: 16, t: 16, b: 36 };
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#64748B" font-size="12">No sessions in range</text></svg>`;
  }
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const vals = all.map((p) => p.v);
  let yMin = opts.yMin ?? Math.min(...vals);
  let yMax = opts.yMax ?? Math.max(...vals);
  if (yMax - yMin < 1e-9) {
    yMax = yMin + 1;
  }
  const padY = (yMax - yMin) * 0.1;
  yMin = opts.yMin ?? yMin - padY;
  yMax = opts.yMax ?? yMax + padY;
  const span = tMax - tMin || 1;
  const x = (t: number) => pad.l + ((t - tMin) / span) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);

  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    const yy = y(v);
    grid += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${yy}" y2="${yy}" stroke="#E2E8F0" stroke-width="1"/>`;
    grid += `<text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#64748B">${formatTick(v)}</text>`;
  }
  const xLabels = [tMin, tMin + span / 2, tMax]
    .map((t, i) => {
      const anchor = i === 0 ? 'start' : i === 2 ? 'end' : 'middle';
      return `<text x="${x(t)}" y="${height - 8}" text-anchor="${anchor}" font-size="10" fill="#64748B">${formatDate(new Date(t).toISOString())}</text>`;
    })
    .join('');

  const lines = series
    .map((s) => {
      if (s.points.length === 0) return '';
      const sorted = [...s.points].sort((a, b) => a.t - b.t);
      const d = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      const dots = sorted
        .map((p) => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="${s.color}"/>`)
        .join('');
      const path = sorted.length > 1 ? `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5"/>` : '';
      return path + dots;
    })
    .join('');

  const legend = series
    .filter((s) => s.points.length > 0)
    .map(
      (s, i) =>
        `<rect x="${pad.l + i * 90}" y="2" width="10" height="10" fill="${s.color}"/><text x="${pad.l + i * 90 + 14}" y="11" font-size="10" fill="#334155">${esc(s.label)}</text>`,
    )
    .join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${grid}${xLabels}${lines}${legend}
  <text transform="translate(12 ${height / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#64748B">${esc(opts.yLabel)}</text>
</svg>`;
}

function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

function fmt(v: number | null, digits: number): string {
  return v === null ? '—' : v.toFixed(digits);
}

export function buildSummaryHtml(input: SummaryInput): string {
  const { sessions, units, rangeLabel, appVersion, deviceModel } = input;
  const u = UNIT_LABEL[units];
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const byPos = (p: Position) => sorted.filter((s) => s.position === p);

  const statRows = POSITIONS.map((p) => {
    const ss = byPos(p);
    if (ss.length === 0) return '';
    const hz = ss.map((s) => s.dominantHz);
    const rms = ss.map((s) => fromG(s.rmsG, units));
    const pr = ss.map((s) => s.peakRatio);
    return `<tr>
      <td><span class="dot" style="background:${POSITION_COLOR[p]}"></span>${POSITION_LABEL[p]}</td>
      <td class="num">${ss.length}</td>
      <td class="num">${fmt(median(hz), 2)} / ${fmt(mean(hz), 2)}</td>
      <td class="num">${fmt(median(rms), units === 'g' ? 4 : 3)} / ${fmt(mean(rms), units === 'g' ? 4 : 3)}</td>
      <td class="num">${fmt(median(pr), 2)}</td>
    </tr>`;
  }).join('');

  const rmsChart = svgChart(
    POSITIONS.map((p) => ({
      label: POSITION_LABEL[p],
      color: POSITION_COLOR[p],
      points: byPos(p).map((s) => ({ t: Date.parse(s.startedAt), v: fromG(s.rmsG, units) })),
    })),
    { width: 680, height: 220, yLabel: `Amplitude (RMS, ${u})`, yMin: 0 },
  );
  const hzChart = svgChart(
    POSITIONS.map((p) => ({
      label: POSITION_LABEL[p],
      color: POSITION_COLOR[p],
      points: byPos(p).map((s) => ({ t: Date.parse(s.startedAt), v: s.dominantHz })),
    })),
    { width: 680, height: 200, yLabel: 'Dominant frequency (Hz)', yMin: 3, yMax: 13 },
  );

  const tagCounts = {
    sleep: { poor: 0, ok: 0, good: 0 },
    stress: [] as number[],
    caffeineYes: 0,
    caffeineNo: 0,
    medsLogged: 0,
    withNotes: 0,
  };
  for (const s of sorted) {
    if (s.sleep) tagCounts.sleep[s.sleep]++;
    if (s.stress !== null) tagCounts.stress.push(s.stress);
    if (s.caffeine === true) tagCounts.caffeineYes++;
    if (s.caffeine === false) tagCounts.caffeineNo++;
    if (s.medsTaken !== null) tagCounts.medsLogged++;
    if (s.notes) tagCounts.withNotes++;
  }

  const sessionRows = sorted
    .map((s) => {
      const tags: string[] = [];
      if (s.sleep) tags.push(`sleep ${s.sleep}`);
      if (s.stress !== null) tags.push(`stress ${s.stress}/5`);
      if (s.caffeine !== null) tags.push(s.caffeine ? 'caffeine' : 'no caffeine');
      if (s.medsTaken !== null) tags.push(s.medsTaken ? `meds logged${s.medsTime ? ` ${s.medsTime}` : ''}` : 'meds not logged');
      const flags = s.qualityFlags.map((f) => QUALITY_FLAG_LABEL[f]).join('; ');
      return `<tr>
        <td>${esc(formatDateTime(s.startedAt))}</td>
        <td>${POSITION_LABEL[s.position]}</td>
        <td class="num">${s.dominantHz.toFixed(2)}</td>
        <td class="num">${fromG(s.rmsG, units).toFixed(units === 'g' ? 4 : 3)}</td>
        <td class="num">${s.peakRatio.toFixed(2)}</td>
        <td class="small">${esc(flags)}</td>
        <td class="small">${esc(tags.join(', '))}${s.notes ? `<br/><em>${esc(s.notes)}</em>` : ''}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 28px; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 8px; color: #0F172A; }
  .sub { color: #475569; margin: 0 0 12px; }
  .notice { background: #F1F5F9; border-left: 4px solid #0E7C86; padding: 10px 12px; margin: 12px 0 18px; color: #334155; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  th { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.small { font-size: 11px; color: #475569; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
  .meta { color: #64748B; font-size: 11px; margin-top: 24px; }
  .grid { display: flex; gap: 16px; }
  .card { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
  .card b { display: block; font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
</style></head>
<body>
  <h1>Tremor Tracker: self-tracked summary</h1>
  <p class="sub">${esc(rangeLabel)} · ${sorted.length} session${sorted.length === 1 ? '' : 's'} · amplitude unit: ${u}</p>
  <div class="notice">
    <strong>Self-tracked, non-diagnostic.</strong> ${esc(DISCLAIMER_SENTENCE)}
    Values are phone-accelerometer measurements of hand movement, taken by the user without supervision.
    Only sessions with the same hand position should be compared with each other.
  </div>

  <h2>Per position (median / mean)</h2>
  <table>
    <thead><tr><th>Position</th><th class="num">Sessions</th><th class="num">Dominant freq (Hz)</th><th class="num">Amplitude RMS (${u})</th><th class="num">Peak ratio (median)</th></tr></thead>
    <tbody>${statRows || '<tr><td colspan="5">No sessions in this range.</td></tr>'}</tbody>
  </table>

  <h2>Amplitude over time</h2>
  ${rmsChart}
  <h2>Dominant frequency over time</h2>
  ${hzChart}

  <h2>Self-reported context (counts only)</h2>
  <div class="grid">
    <div class="card"><b>Sleep</b>poor ${tagCounts.sleep.poor} · ok ${tagCounts.sleep.ok} · good ${tagCounts.sleep.good}</div>
    <div class="card"><b>Stress (1–5)</b>${tagCounts.stress.length ? `mean ${fmt(mean(tagCounts.stress), 1)} over ${tagCounts.stress.length}` : '—'}</div>
    <div class="card"><b>Caffeine</b>yes ${tagCounts.caffeineYes} · no ${tagCounts.caffeineNo}</div>
    <div class="card"><b>Medication log entries</b>${tagCounts.medsLogged} (user-entered; times only)</div>
  </div>

  <h2>Sessions</h2>
  <table>
    <thead><tr><th>When</th><th>Position</th><th class="num">Hz</th><th class="num">RMS (${u})</th><th class="num">Peak ratio</th><th>Quality notes</th><th>Context</th></tr></thead>
    <tbody>${sessionRows || '<tr><td colspan="7">No sessions in this range.</td></tr>'}</tbody>
  </table>

  <p class="meta">
    Method: phone accelerometer, resampled to 100 Hz, 2 s trimmed from each end, 1 Hz high-pass, Welch PSD (4 s segments) summed over axes;
    dominant frequency = PSD peak in 4–12 Hz; amplitude = RMS of the 4–12 Hz band-passed signal; peak ratio = power within ±1 Hz of the peak / power in 1–20 Hz.
    These metrics are not calibrated against a clinical scale.<br/>
    Generated ${esc(formatDateTime(new Date().toISOString()))} by Tremor Tracker ${esc(appVersion)}${deviceModel ? ` on ${esc(deviceModel)}` : ''}. All data stayed on the user's device until this export.
  </p>
</body></html>`;
}
