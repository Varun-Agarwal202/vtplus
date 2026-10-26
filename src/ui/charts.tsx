import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import type { Position } from '@/db/types';
import { formatDate } from '@/lib/format';
import { LEVELS, levelFor, levelIndex, scalePosition } from '@/lib/interpret';
import { POSITION_MARK, useTheme } from './theme';

/** Charts are drawn in SVG, which screen readers can't read; each one is exposed as a single labelled image instead. */
const HIDE_CHILDREN = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

function chartA11y(label: string) {
  return { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label };
}

/** Measures its own width so charts can be fluid. */
function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(100, Math.round(e.nativeEvent.layout.width)))];
}

/* ---------- Live ring and waveform (UI thread) ---------- */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * A progress ring whose arc is drawn from a shared value on the UI thread, so
 * a running timer never re-renders React. Used while recording.
 */
export function LiveRing({
  progress,
  size = 240,
  stroke = 8,
  color,
  children,
}: {
  progress: SharedValue<number>;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, progress.value))) }), [c]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }} {...HIDE_CHILDREN}>
        <Circle cx={mid} cy={mid} r={r} stroke={colors.inset} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={mid}
          cy={mid}
          r={r}
          stroke={color ?? colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={arc}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** The live accelerometer trace, built on the UI thread from a shared buffer of magnitudes. */
export function LiveWaveform({ values, height = 56, color }: { values: SharedValue<number[]>; height?: number; color?: string }) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const line = useAnimatedProps(() => {
    const v = values.value;
    const n = v.length;
    const midY = height / 2;
    if (n < 2) return { d: `M0 ${midY} L${width} ${midY}` };
    let mean = 0;
    for (let i = 0; i < n; i++) mean += v[i];
    mean /= n;
    let maxDev = 1e-6;
    for (let i = 0; i < n; i++) maxDev = Math.max(maxDev, Math.abs(v[i] - mean));
    // auto-scale but never zoom in beyond 0.01 g so a still phone shows as flat
    const scale = Math.max(maxDev, 0.01);
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * width;
      const y = midY - ((v[i] - mean) / scale) * (midY - 4);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return { d };
  }, [width, height]);
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} {...HIDE_CHILDREN}>
      <Svg width={width} height={height}>
        <AnimatedPath animatedProps={line} fill="none" stroke={color ?? colors.ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/* ---------- Amplitude scale (the ruler) ---------- */

/**
 * The five-band amplitude scale drawn as a ruler. The current reading is the
 * signal dot; an optional previous reading is a hollow tick.
 */
export function AmplitudeScale({ rmsG, previousG, height = 64 }: { rmsG: number; previousG?: number | null; height?: number }) {
  const { colors, textScale: ts } = useTheme();
  const [width, onLayout] = useWidth();
  const n = LEVELS.length;
  const barY = 22;
  const barH = 10;
  const x = (p: number) => 1 + p * (width - 2);
  const px = x(scalePosition(rmsG));
  const prev = previousG !== undefined && previousG !== null ? x(scalePosition(previousG)) : null;
  const level = levelFor(rmsG);
  const label =
    `Movement scale: ${level.label}, level ${levelIndex(level.id) + 1} of ${n}.` +
    (previousG !== undefined && previousG !== null ? ` Last session was ${levelFor(previousG).label.toLowerCase()}.` : '');
  return (
    <View onLayout={onLayout} style={{ width: '100%', height }} {...chartA11y(label)}>
      <Svg width={width} height={height} {...HIDE_CHILDREN}>
        {LEVELS.map((b, i) => {
          const x0 = x(i / n) + (i === 0 ? 0 : 1.5);
          const x1 = x((i + 1) / n) - (i === n - 1 ? 0 : 1.5);
          return (
            <G key={b.id}>
              <Rect x={x0} y={barY} width={x1 - x0} height={barH} rx={barH / 2} fill={colors.inset} />
              <Rect x={x0} y={barY} width={x1 - x0} height={barH} rx={barH / 2} fill={colors.accent} fillOpacity={0.12 + i * 0.12} />
              <SvgText x={(x0 + x1) / 2} y={height - 8} fontSize={11 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="middle">
                {b.label}
              </SvgText>
            </G>
          );
        })}
        {prev !== null ? (
          <G>
            <Line x1={prev} x2={prev} y1={barY - 6} y2={barY + barH + 6} stroke={colors.ink3} strokeWidth={1.5} strokeLinecap="round" />
            <SvgText x={prev} y={barY - 10} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="middle">
              Last
            </SvgText>
          </G>
        ) : null}
        <Circle cx={px} cy={barY + barH / 2} r={8} fill={colors.ink} stroke={colors.surface} strokeWidth={3} />
      </Svg>
    </View>
  );
}

/* ---------- Spectrum ---------- */

export function SpectrumChart({
  f,
  psd,
  band = [4, 12],
  peakHz,
  maxHz = 20,
  height = 170,
}: {
  f: ArrayLike<number>;
  psd: ArrayLike<number>;
  band?: [number, number];
  peakHz?: number;
  maxHz?: number;
  height?: number;
}) {
  const { colors, textScale: ts } = useTheme();
  const [width, onLayout] = useWidth();
  const pad = { l: 4, r: 4, t: 14, b: 22 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const { path, area, maxV } = useMemo(() => {
    let maxV = 0;
    const idx: number[] = [];
    for (let i = 0; i < f.length; i++) {
      if (f[i] <= maxHz) {
        idx.push(i);
        if (f[i] >= 1) maxV = Math.max(maxV, psd[i]);
      }
    }
    if (maxV <= 0) maxV = 1;
    const x = (hz: number) => pad.l + (hz / maxHz) * plotW;
    const y = (v: number) => pad.t + plotH - Math.min(1, v / maxV) * plotH;
    let d = '';
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      d += `${k === 0 ? 'M' : 'L'}${x(f[i]).toFixed(1)},${y(psd[i]).toFixed(1)}`;
    }
    const last = idx[idx.length - 1];
    const area = idx.length ? `${d} L${x(f[last]).toFixed(1)},${(pad.t + plotH).toFixed(1)} L${x(f[idx[0]]).toFixed(1)},${(pad.t + plotH).toFixed(1)} Z` : '';
    return { path: d, area, maxV };
  }, [f, psd, maxHz, plotW, plotH, pad.l, pad.t]);

  const x = (hz: number) => pad.l + (hz / maxHz) * plotW;
  const ticks = [0, 4, 8, 12, 16, 20].filter((t) => t <= maxHz);
  const label =
    peakHz !== undefined
      ? `Frequency chart from 0 to ${maxHz} per second. The strongest movement is at about ${peakHz.toFixed(1)} times a second.`
      : `Frequency chart from 0 to ${maxHz} per second.`;

  return (
    <View onLayout={onLayout} style={{ width: '100%', height }} {...chartA11y(label)}>
      <Svg width={width} height={height} {...HIDE_CHILDREN}>
        <Rect x={x(band[0])} y={pad.t} width={x(band[1]) - x(band[0])} height={plotH} fill={colors.chart.band} />
        <Line x1={pad.l} x2={width - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke={colors.hairlineStrong} strokeWidth={1} />
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={x(t)} x2={x(t)} y1={pad.t + plotH} y2={pad.t + plotH + 4} stroke={colors.hairlineStrong} strokeWidth={1} />
            <SvgText x={x(t)} y={height - 4} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="middle">
              {`${t}`}
            </SvgText>
          </G>
        ))}
        {area ? <Path d={area} fill={colors.ink} fillOpacity={0.06} /> : null}
        {path ? <Path d={path} fill="none" stroke={colors.chart.line} strokeWidth={1.5} strokeLinejoin="round" /> : null}
        {peakHz !== undefined && maxV > 0 ? (
          <G>
            <Line x1={x(peakHz)} x2={x(peakHz)} y1={pad.t} y2={pad.t + plotH} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" />
            <Circle cx={x(peakHz)} cy={pad.t} r={3.5} fill={colors.accent} />
          </G>
        ) : null}
        <SvgText x={x(band[0]) + 4} y={pad.t + 10} fontSize={9 * Math.min(ts, 1.3)} fill={colors.ink3}>
          {`${band[0]}–${band[1]} Hz`}
        </SvgText>
      </Svg>
    </View>
  );
}

/* ---------- RMS timeline (bars) ---------- */

export function BarStrip({ values, height = 56, color }: { values: ArrayLike<number>; height?: number; color?: string }) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const n = values.length;
  let max = 1e-9;
  for (let i = 0; i < n; i++) max = Math.max(max, values[i]);
  const gap = 2;
  const bw = n > 0 ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  let peakAt = 0;
  for (let i = 0; i < n; i++) if (values[i] > values[peakAt]) peakAt = i;
  const where = n === 0 ? '' : peakAt < n / 3 ? 'near the start' : peakAt < (2 * n) / 3 ? 'in the middle' : 'near the end';
  const label = n ? `Movement through the recording, ${n} bars. Strongest ${where}.` : 'Movement through the recording.';
  return (
    <View onLayout={onLayout} style={{ width: '100%', height }} {...chartA11y(label)}>
      <Svg width={width} height={height} {...HIDE_CHILDREN}>
        <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={colors.hairlineStrong} strokeWidth={1} />
        {Array.from({ length: n }, (_, i) => {
          const h = Math.max(2, (values[i] / max) * (height - 3));
          return <Rect key={i} x={i * (bw + gap)} y={height - 1 - h} width={bw} height={h} fill={color ?? colors.ink} opacity={0.8} />;
        })}
      </Svg>
    </View>
  );
}

/* ---------- Trend chart ---------- */

export interface TrendPoint {
  id: string;
  t: number;
  v: number;
  position: Position;
  flagged?: boolean;
}

function Marker({ position, cx, cy, r, fill, stroke, onPress }: { position: Position; cx: number; cy: number; r: number; fill: string; stroke: string; onPress?: () => void }) {
  const shape = POSITION_MARK[position];
  const common = { fill, stroke, strokeWidth: 1.5, onPress };
  const d = r * 1.25;
  return (
    <G>
      {/* a generous invisible touch area: small dots are hard to hit with a shaking hand */}
      {onPress ? <Circle cx={cx} cy={cy} r={18} fill="transparent" onPress={onPress} /> : null}
      {shape === 'circle' ? (
        <Circle cx={cx} cy={cy} r={r} {...common} />
      ) : shape === 'square' ? (
        <Rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />
      ) : (
        <Polygon points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`} {...common} />
      )}
    </G>
  );
}

export function TrendChart({
  points,
  height = 200,
  yMin,
  yMax,
  formatY,
  onPressPoint,
  highlightId,
  accessibilityLabel,
}: {
  points: TrendPoint[];
  height?: number;
  yMin?: number;
  yMax?: number;
  formatY?: (v: number) => string;
  onPressPoint?: (id: string) => void;
  highlightId?: string;
  accessibilityLabel?: string;
}) {
  const { colors, textScale: ts } = useTheme();
  const [width, onLayout] = useWidth();
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;

  const layout = useMemo(() => {
    if (points.length === 0) return null;
    const ts = points.map((p) => p.t);
    const vs = points.map((p) => p.v);
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    let lo = yMin ?? Math.min(...vs);
    let hi = yMax ?? Math.max(...vs);
    if (hi - lo < 1e-9) hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.5);
    if (yMin === undefined) lo -= (hi - lo) * 0.1;
    if (yMax === undefined) hi += (hi - lo) * 0.1;
    if (yMin === 0) lo = 0;
    const span = tMax - tMin;
    const x = (t: number) => (span > 0 ? pad.l + ((t - tMin) / span) * plotW : pad.l + plotW / 2);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * plotH;
    return { tMin, tMax, lo, hi, x, y };
  }, [points, yMin, yMax, plotW, plotH, pad.l, pad.t]);

  const fy = formatY ?? ((v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)));
  const positions = Array.from(new Set(points.map((p) => p.position)));
  const label = accessibilityLabel ?? trendLabel(points, fy);
  // the point that gets a value tag: the highlighted one, else the most recent
  const tagged = points.length ? (points.find((p) => p.id === highlightId) ?? points.reduce((a, b) => (b.t > a.t ? b : a))) : null;
  const fontSize = 10 * Math.min(ts, 1.3);

  return (
    <View onLayout={onLayout} style={{ width: '100%', height }} {...chartA11y(label)}>
      <Svg width={width} height={height}>
        {layout ? (
          <>
            {[0, 0.5, 1].map((k) => {
              const v = layout.lo + (layout.hi - layout.lo) * k;
              const yy = layout.y(v);
              return (
                <G key={k}>
                  <Line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke={k === 0 ? colors.hairlineStrong : colors.chart.grid} strokeWidth={1} />
                  <SvgText x={pad.l - 8} y={yy + 3} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="end">
                    {fy(v)}
                  </SvgText>
                </G>
              );
            })}
            {positions.map((pos) => {
              const pts = points.filter((p) => p.position === pos).sort((a, b) => a.t - b.t);
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${layout.x(p.t).toFixed(1)},${layout.y(p.v).toFixed(1)}`).join(' ');
              const base = layout.y(layout.lo).toFixed(1);
              const area = `${d} L${layout.x(pts[pts.length - 1].t).toFixed(1)},${base} L${layout.x(pts[0].t).toFixed(1)},${base} Z`;
              return (
                <G key={pos}>
                  {/* a soft fill under the line, only when one position is shown so fills never overlap */}
                  {pts.length > 1 && positions.length === 1 ? <Path d={area} fill={colors.chart.band} /> : null}
                  {pts.length > 1 ? <Path d={d} fill="none" stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
                  {pts.map((p) => {
                    const hl = p.id === highlightId;
                    return (
                      <Marker
                        key={p.id}
                        position={pos}
                        cx={layout.x(p.t)}
                        cy={layout.y(p.v)}
                        r={hl ? 6 : 4.5}
                        fill={hl ? colors.signal : p.flagged ? colors.bg : colors.surface}
                        stroke={hl ? colors.signal : p.flagged ? colors.ink3 : colors.accent}
                        onPress={onPressPoint ? () => onPressPoint(p.id) : undefined}
                      />
                    );
                  })}
                </G>
              );
            })}
            {tagged ? <ValueTag x={layout.x(tagged.t)} y={layout.y(tagged.v)} base={layout.y(layout.lo)} text={fy(tagged.v)} fontSize={fontSize} minX={pad.l} maxX={width - pad.r} /> : null}
            <SvgText x={pad.l} y={height - 4} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3}>
              {formatDate(new Date(layout.tMin).toISOString())}
            </SvgText>
            {layout.tMax !== layout.tMin ? (
              <SvgText x={width - pad.r} y={height - 4} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="end">
                {formatDate(new Date(layout.tMax).toISOString())}
              </SvgText>
            ) : null}
          </>
        ) : (
          <SvgText x={width / 2} y={height / 2} fontSize={13 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="middle">
            No sessions yet
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

/** A small ink label above a point with a dashed drop line to the axis, like the "latest" marker on a fitness chart. */
function ValueTag({ x, y, base, text, fontSize, minX, maxX }: { x: number; y: number; base: number; text: string; fontSize: number; minX: number; maxX: number }) {
  const { colors } = useTheme();
  const w = text.length * fontSize * 0.62 + 12;
  const h = fontSize + 10;
  const left = Math.min(Math.max(x - w / 2, minX), maxX - w);
  const top = Math.max(0, y - 9 - h);
  return (
    <G>
      <Line x1={x} x2={x} y1={y + 6} y2={base} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      <Rect x={left} y={top} width={w} height={h} rx={h / 2} fill={colors.ink} />
      <SvgText x={left + w / 2} y={top + h / 2 + fontSize * 0.36} fontSize={fontSize} fontWeight="600" fill={colors.onInk} textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

export function trendLabel(points: TrendPoint[], fy: (v: number) => string): string {
  if (points.length === 0) return 'Trend chart. No sessions yet.';
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const vs = sorted.map((p) => p.v);
  const first = formatDate(new Date(sorted[0].t).toISOString());
  const last = formatDate(new Date(sorted[sorted.length - 1].t).toISOString());
  return (
    `Trend chart of ${points.length} session${points.length === 1 ? '' : 's'} from ${first} to ${last}. ` +
    `Lowest ${fy(Math.min(...vs))}, highest ${fy(Math.max(...vs))}, most recent ${fy(vs[vs.length - 1])}. ` +
    'Each session is also listed below.'
  );
}

/* ---------- Dose–response curves ---------- */

export interface DoseCurveSeries {
  label: string;
  points: { dose: number; reduction: number }[];
  /** dashed = secondary */
  dashed?: boolean;
  /** dose marker to draw on this series, mg */
  markerDose?: number | null;
}

export function DoseCurveChart({ series, target, maxDose, height = 180 }: { series: DoseCurveSeries[]; target: number; maxDose: number; height?: number }) {
  const { colors, textScale: ts } = useTheme();
  const [width, onLayout] = useWidth();
  const pad = { l: 36, r: 8, t: 10, b: 24 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (d: number) => pad.l + (d / maxDose) * plotW;
  const y = (r: number) => pad.t + (1 - Math.max(0, Math.min(1, r))) * plotH;
  const xt = [0, 80, 160, 240, 320].filter((d) => d <= maxDose);
  const marker = series.find((s) => s.markerDose !== null && s.markerDose !== undefined)?.markerDose;
  const label = `Dose estimate curve. Target ${Math.round(target * 100)}% less movement${marker ? `, at about ${Math.round(marker)} milligrams a day` : ''}.`;
  return (
    <View onLayout={onLayout} style={{ width: '100%', height }} {...chartA11y(label)}>
      <Svg width={width} height={height} {...HIDE_CHILDREN}>
        {[0, 0.25, 0.5, 0.75, 1].map((k) => (
          <G key={k}>
            <Line x1={pad.l} x2={width - pad.r} y1={y(k)} y2={y(k)} stroke={k === 0 ? colors.hairlineStrong : colors.chart.grid} strokeWidth={1} />
            <SvgText x={pad.l - 6} y={y(k) + 3} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="end">
              {`${Math.round(k * 100)}%`}
            </SvgText>
          </G>
        ))}
        {xt.map((d) => (
          <SvgText key={d} x={x(d)} y={height - 4} fontSize={10 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor={d === 0 ? 'start' : d === maxDose ? 'end' : 'middle'}>
            {`${d}`}
          </SvgText>
        ))}
        <Line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} stroke={colors.signal} strokeWidth={1} strokeDasharray="3 3" />
        {series.map((s, i) => {
          const d = s.points.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.dose).toFixed(1)},${y(p.reduction).toFixed(1)}`).join(' ');
          const m = s.markerDose;
          const my = m !== null && m !== undefined ? s.points.reduce((best, p) => (Math.abs(p.dose - m) < Math.abs(best.dose - m) ? p : best), s.points[0]).reduction : null;
          return (
            <G key={i}>
              <Path d={d} fill="none" stroke={colors.ink} strokeWidth={1.5} strokeDasharray={s.dashed ? '5 4' : undefined} />
              {m !== null && m !== undefined && my !== null ? (
                <G>
                  <Line x1={x(m)} x2={x(m)} y1={y(my)} y2={pad.t + plotH} stroke={colors.ink3} strokeWidth={1} />
                  <Circle cx={x(m)} cy={y(my)} r={5} fill={colors.signal} stroke={colors.bg} strokeWidth={2} />
                </G>
              ) : null}
              {s.label ? (
                <SvgText
                  x={width - pad.r}
                  y={y(s.points[s.points.length - 1].reduction) - 5}
                  fontSize={9 * Math.min(ts, 1.3)}
                  fill={colors.ink2}
                  textAnchor="end">
                  {s.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        <SvgText x={width - pad.r} y={height - 4 - 12} fontSize={9 * Math.min(ts, 1.3)} fill={colors.ink3} textAnchor="end">
          mg/day
        </SvgText>
      </Svg>
    </View>
  );
}
