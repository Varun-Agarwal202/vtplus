# Style lock — Tremor Tracker

Established: 2026-10-25. Source: existing product brief, shipped app structure, and viewed health-tracking references.

## Palette

- Background: `#F7F5F0` (low-glare app canvas)
- Surface: `#FFFDF8` (panels and grouped controls)
- Primary: `#20201D` (high-emphasis controls and data)
- Accent: `#0B625D` (deliberate navigation and action)
- Signal: `#B54120` (live recording and attention only)
- Text primary: `#20201D` on `#F7F5F0`
- Button label color: white on signal, dark ink on teal high-contrast mode
- Dark mode: runtime toggle, with the companion palette defined in `src/ui/theme.ts`

## Color contract

- Body text uses ink on the background or surface only.
- White labels appear only on ink or signal fills.
- Teal carries links, controls, focus, and icons. It is not a second recording color.
- Rust is exclusive to recording, warnings, and destructive attention.
- Hairlines are decorative unless a high-contrast mode raises them to a state boundary.
- Light-mode verification: ink/background 14.99:1, ink/surface 16.07:1, teal/background 6.60:1, teal/surface 7.08:1, and white/signal 5.61:1.
- Dark-mode verification: ink/background 16.26:1, ink/surface 14.86:1, and teal/background 9.17:1.

## Typography

- Display/heading font: system sans, compact and familiar on iOS and Android.
- Body font: system sans with tabular numerals for all measurements.
- Scale: 4px spacing grid, 17px body text, 34px display, 64px live readout.

## Shape language

- Corner radius: 10px controls, 14px compact panels, 20px grouped cards, full circles for direct touch targets.
- Shadow depth: flat, no shadows.
- Border usage: hairline rules and high-contrast outlines instead of elevation.

## Density & spacing

- Base unit: 4px.
- Content-card padding: 16px.
- Overall density: calm and reachable, with 52px primary targets by default.
- Section separation: fixed spacing with quiet grouped surfaces.

## Reference intelligence

- Reference board: `.tastemaker/reference-board.md` (viewed sources)
- Design read: accessibility-forward health-tracking app, mode Operate, quiet instrument lane.
- Dials: variance 3, motion 3, density 6, art direction 7.
- Foundation: existing Expo React Native stack; no web registry applies to native screens.
- Quality bar: Apple Health, Apple Charts, Kampa, and TremorTracker.
- Direction contract: a repeatable measurement ritual with high legibility and no diagnostic framing.
- Anti-references: cold clinical dashboards, dense controls, decorative animation, overused alarm color.

## Taste memory

- Profile priors used: none found.
- Decision log: `.tastemaker/decisions.log`.
- Pending review: warm paper palette and posture cue on the Measure screen.
- Profile promotion: none.

## Navigation chrome

- Content area: Background.
- Active nav item: teal icon and label, without a competing filled pill.
- Shell density: four large, labelled bottom tabs with no hidden gesture-only navigation.

## Mood descriptors

Quiet, steady, humane, precise.

## Assets

- Anchor asset: existing app icon set in `assets/images/`.
- Asset style: one existing Ionicons outline family, plus native SVG data graphics.
- Illustration vs. photography split: no photo or illustration is needed in the operating flow; posture guidance is code-native and specific.

## Motion

- Feel: quick and restrained.
- Curves: critically damped React Native springs from `src/ui/theme.ts`.
- Durations: press 220ms, control movement 380ms.
- Screen tracks: recording progress, control selection, and press feedback only.
- Reduced motion: all springs resolve immediately while color and state text remain.
- Verified by: `audit_motion.py` on `src/app/(tabs)/index.tsx`, `src/ui/theme.ts`, and `src/ui/primitives.tsx` on 2026-10-25.

## Do not

- Do not use gradients, shadows, generic wellness imagery, or color alone to identify a measurement position.
