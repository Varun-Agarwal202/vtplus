import { PAPER_ANCHORS, PARAMS, curvePoints, estimateDose, hill, hillInverse, reductionToReach, solveHill } from '../hill';

describe('Hill calibration reproduces the paper', () => {
  it('320 mg alone gives a 50% reduction and a 38.1 mmHg drop', () => {
    expect(hill(PARAMS.tremor, 320)).toBeCloseTo(0.5, 6);
    expect(hill(PARAMS.bloodPressure, 320)).toBeCloseTo(38.1, 6);
  });

  it('90 mg + closed-loop VTS also gives 50%, with an 18.9 mmHg drop', () => {
    const total = 1 - (1 - PAPER_ANCHORS.vtsClosedLoop) * (1 - hill(PARAMS.tremor, 90));
    expect(total).toBeCloseTo(0.5, 6);
    expect(hill(PARAMS.bloodPressure, 90)).toBeCloseTo(18.9, 6);
  });

  it('curves are monotonic and bounded by their ceilings', () => {
    let prev = -1;
    for (const p of curvePoints('none')) {
      expect(p.reduction).toBeGreaterThanOrEqual(prev);
      expect(p.reduction).toBeLessThan(PAPER_ANCHORS.tremorEmax);
      expect(p.bpDrop).toBeLessThan(PAPER_ANCHORS.bpMax);
      prev = p.reduction;
    }
  });

  it('inverse undoes forward', () => {
    for (const d of [10, 60, 120, 250]) {
      expect(hillInverse(PARAMS.tremor, hill(PARAMS.tremor, d))).toBeCloseTo(d, 6);
    }
    expect(hillInverse(PARAMS.tremor, PARAMS.tremor.emax)).toBe(Infinity);
    expect(hillInverse(PARAMS.tremor, 0)).toBe(0);
  });

  it('solveHill passes through its anchors', () => {
    const c = solveHill(1, { dose: 10, effect: 0.2 }, { dose: 100, effect: 0.7 });
    expect(hill(c, 10)).toBeCloseTo(0.2, 9);
    expect(hill(c, 100)).toBeCloseTo(0.7, 9);
  });
});

describe('estimateDose', () => {
  it('matches the paper headline: 320 mg vs 90 mg for a 50% target', () => {
    expect(estimateDose(0.5, 'none').doseMg).toBe(320);
    expect(estimateDose(0.5, 'closedLoop').doseMg).toBe(90);
    expect(estimateDose(0.5, 'none').bpDropMmHg).toBeCloseTo(38.1, 1);
    expect(estimateDose(0.5, 'closedLoop').bpDropMmHg).toBeCloseTo(18.9, 1);
  });

  it('needs no drug when VTS alone meets the target', () => {
    const e = estimateDose(0.4, 'closedLoop');
    expect(e.doseMg).toBe(0);
    expect(e.drugReduction).toBe(0);
    expect(e.bpDropMmHg).toBe(0);
  });

  it('flags targets beyond the modeled range', () => {
    const e = estimateDose(0.7, 'none');
    expect(e.beyondRange).toBe(true);
    expect(e.doseMg).toBeNull();
    expect(e.achievedReduction).toBeCloseTo(0.5, 3);
    expect(estimateDose(0.7, 'closedLoop').beyondRange).toBe(false);
  });

  it('closed-loop VTS always needs less drug than constant, which needs less than none', () => {
    for (const t of [0.3, 0.45, 0.55]) {
      const none = estimateDose(t, 'none').doseExactMg;
      const constant = estimateDose(t, 'constant').doseExactMg;
      const closed = estimateDose(t, 'closedLoop').doseExactMg;
      expect(closed).toBeLessThanOrEqual(constant);
      expect(constant).toBeLessThanOrEqual(none);
    }
  });

  it('rounds to 10 mg steps', () => {
    for (const t of [0.2, 0.35, 0.5]) {
      const d = estimateDose(t, 'none').doseMg;
      if (d !== null) expect(d % 10).toBe(0);
    }
  });
});

describe('reductionToReach', () => {
  it('computes the fractional cut needed to hit an amplitude', () => {
    expect(reductionToReach(0.1, 0.04)).toBeCloseTo(0.6, 9);
    expect(reductionToReach(0.03, 0.04)).toBe(0);
    expect(reductionToReach(10, 0.01)).toBe(0.95);
    expect(reductionToReach(0, 0.01)).toBe(0);
  });
});
