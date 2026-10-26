import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { Units } from '@/db/settings';
import { LEVELS } from '@/lib/interpret';
import { MODEL_DISCLAIMER, PARAMS, curvePoints, estimateDose, reductionToReach } from '@/model/hill';
import { DoseCurveChart } from './charts';
import { Box, Chip, Row, Spacer, Text } from './primitives';
import { spacing } from './theme';

type TargetKey = '30' | '50' | '70' | 'slight';

const SLIGHT_MAX_G = LEVELS[2].min;

export function DoseModelPanel({ rmsG }: { rmsG: number; units?: Units; acknowledged?: boolean; onAcknowledge?: () => void }) {
  const [targetKey, setTargetKey] = useState<TargetKey>('50');

  const slightReduction = reductionToReach(rmsG, SLIGHT_MAX_G);
  const canTargetSlight = slightReduction >= 0.1;
  const target = targetKey === 'slight' ? slightReduction : Number(targetKey) / 100;
  const est = useMemo(() => estimateDose(target, 'none'), [target]);
  const curves = useMemo(
    () => [{ label: '', points: curvePoints('none'), markerDose: est.doseMg }],
    [est.doseMg],
  );

  const doseText = est.beyondRange ? `>${PARAMS.maxDoseMg}` : `${est.doseMg ?? 0}`;

  return (
    <Box>
      <Text variant="caption" muted>
        To cut this movement by
      </Text>
      <Spacer size={spacing.sm} />
      <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
        <Chip label="30%" selected={targetKey === '30'} onPress={() => setTargetKey('30')} />
        <Chip label="50%" selected={targetKey === '50'} onPress={() => setTargetKey('50')} />
        <Chip label="70%" selected={targetKey === '70'} onPress={() => setTargetKey('70')} />
        {canTargetSlight ? <Chip label="down to slight" selected={targetKey === 'slight'} onPress={() => setTargetKey('slight')} /> : null}
      </Row>

      <Spacer size={spacing.lg} />
      <Row gap={spacing.lg}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted>
            Propranolol
          </Text>
          <Row gap={4} style={{ alignItems: 'baseline', marginTop: 4 }}>
            <Text variant="readout">{doseText}</Text>
            <Text variant="caption" muted>
              mg / day
            </Text>
          </Row>
          {est.beyondRange ? (
            <Text variant="caption" muted>
              That’s as far as this estimate goes.
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted>
            Blood pressure
          </Text>
          <Row gap={4} style={{ alignItems: 'baseline', marginTop: 4 }}>
            <Text variant="readout">{est.bpDropMmHg < 0.5 ? '0' : `−${est.bpDropMmHg.toFixed(0)}`}</Text>
            <Text variant="caption" muted>
              mmHg
            </Text>
          </Row>
        </View>
      </Row>

      <Spacer size={spacing.md} />
      <DoseCurveChart series={curves} target={target} maxDose={PARAMS.maxDoseMg} />
      <Spacer size={spacing.sm} />
      <Text variant="caption" faint>
        {MODEL_DISCLAIMER}
      </Text>
    </Box>
  );
}
