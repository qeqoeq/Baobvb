import { describe, expect, it } from 'vitest';

import { derivePrivateFitEvidence } from './private-fit-evidence';

const FORBIDDEN_KEY_SUBSTRINGS = [
  'score',
  'average',
  'rank',
  'estimate',
  'percentage',
  'percent',
  'weighted',
  'confidenceScore',
];

describe('derivePrivateFitEvidence', () => {
  it('a place without a quickSignal yields weak evidence with a missing signal', () => {
    const evidence = derivePrivateFitEvidence({ personalFit: 'kept' });
    expect(evidence.hasExperiencedSignal).toBe(false);
    expect(evidence.missingSignals).toContain('no_experience');
    expect(evidence.landingLevel).toBeUndefined();
    expect(evidence.dimensionSignals).toBeUndefined();
  });

  it('a place with personalFit different from kept never claims rich evidence, even with a quickSignal present', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'saved',
      quickSignal: { landingLevel: 5, shareSafe: true },
    });
    expect(evidence.hasExperiencedSignal).toBe(false);
    expect(evidence.missingSignals).toContain('no_experience');
    expect(evidence.landingLevel).toBeUndefined();
  });

  it('landingLevel is preserved exactly, with no derived score', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4 },
    });
    expect(evidence.landingLevel).toBe(4);
    expect(evidence).not.toHaveProperty('score');
    expect(evidence).not.toHaveProperty('estimate');
  });

  it('only selected driverDimensions appear in dimensionSignals', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: {
        driverDimensions: ['food', 'cleanliness'],
        restaurantDimensions: { food: 5, cleanliness: 1, service: 3, value: 4 },
      },
    });
    expect(evidence.selectedDrivers).toEqual(['food', 'cleanliness']);
    expect(evidence.dimensionSignals).toEqual({ food: 5, cleanliness: 1 });
  });

  it('restaurantDimensions not selected as drivers are ignored, not treated as neutral', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: {
        driverDimensions: ['food'],
        restaurantDimensions: { food: 5, service: 3, atmosphere: 3, value: 3, cleanliness: 3 },
      },
    });
    expect(evidence.dimensionSignals).toEqual({ food: 5 });
    expect(evidence.dimensionSignals).not.toHaveProperty('service');
    expect(evidence.dimensionSignals).not.toHaveProperty('atmosphere');
    expect(evidence.dimensionSignals).not.toHaveProperty('value');
    expect(evidence.dimensionSignals).not.toHaveProperty('cleanliness');
  });

  it('shareSafe false is carried as recommendation responsibility, not a score adjustment', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 5, shareSafe: false },
    });
    expect(evidence.shareSafe).toBe(false);
    expect(evidence.landingLevel).toBe(5);
    expect(evidence).not.toHaveProperty('score');
  });

  it('contextFit is preserved separately from quality signals', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4, contextFit: ['date', 'calm'] },
    });
    expect(evidence.contextFit).toEqual(['date', 'calm']);
    expect(evidence.landingLevel).toBe(4);
  });

  it('sourceRelationId is carried as an opaque identifier, never resolved to a name', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4 },
      sourceRelationId: 'rel-42',
      sourceTrustEligible: true,
    });
    expect(evidence.sourceRelationId).toBe('rel-42');
    expect(evidence).not.toHaveProperty('sourceName');
    expect(evidence).not.toHaveProperty('recommendedBy');
  });

  it('sourceTrustEligible false does not erase experience evidence, only marks the source', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 5, shareSafe: true },
      sourceRelationId: 'rel-7',
      sourceTrustEligible: false,
    });
    expect(evidence.hasExperiencedSignal).toBe(true);
    expect(evidence.landingLevel).toBe(5);
    expect(evidence.sourceTrustEligible).toBe(false);
    expect(evidence.missingSignals).toContain('source_not_trust_eligible');
  });

  it('a source relation without a trust eligibility flag is flagged as missing the relation, not as eligible', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 3 },
    });
    expect(evidence.missingSignals).toContain('no_source_relation');
    expect(evidence.sourceTrustEligible).toBeUndefined();
  });

  it('no forbidden key appears anywhere in the returned object, for any input shape', () => {
    const cases = [
      derivePrivateFitEvidence({ personalFit: 'kept' }),
      derivePrivateFitEvidence({ personalFit: 'not_for_me', quickSignal: { landingLevel: 1 } }),
      derivePrivateFitEvidence({
        personalFit: 'kept',
        quickSignal: {
          landingLevel: 5,
          driverDimensions: ['food', 'service'],
          restaurantDimensions: { food: 5, service: 4 },
          shareSafe: true,
          contextFit: ['friends'],
        },
        sourceRelationId: 'rel-1',
        sourceTrustEligible: true,
      }),
    ];

    for (const evidence of cases) {
      const keys = Object.keys(evidence);
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        for (const forbidden of FORBIDDEN_KEY_SUBSTRINGS) {
          expect(lowerKey).not.toContain(forbidden.toLowerCase());
        }
      }
    }
  });
});
