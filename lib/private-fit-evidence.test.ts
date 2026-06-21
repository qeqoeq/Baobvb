import { describe, expect, it } from 'vitest';

import {
  buildPrivateFitEvidenceSourceContext,
  deriveRouteObjectUsagePresence,
  deriveRouteObjectUsageSignal,
  derivePrivateFitEvidence,
  resolvePrivateFitEvidenceSourceTrust,
} from './private-fit-evidence';

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

describe('resolvePrivateFitEvidenceSourceTrust', () => {
  it('returns true when revealed, trustRating >= 4, and not archived', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({
        isRevealed: true,
        trustRating: 4,
        isArchived: false,
      }),
    ).toBe(true);
  });

  it('returns true when isArchived is omitted entirely', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({ isRevealed: true, trustRating: 5 }),
    ).toBe(true);
  });

  it('returns false when not revealed', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({
        isRevealed: false,
        trustRating: 5,
        isArchived: false,
      }),
    ).toBe(false);
  });

  it('returns false when trustRating is below 4', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({
        isRevealed: true,
        trustRating: 3,
        isArchived: false,
      }),
    ).toBe(false);
  });

  it('returns false when trustRating is null', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({
        isRevealed: true,
        trustRating: null,
        isArchived: false,
      }),
    ).toBe(false);
  });

  it('returns false when archived', () => {
    expect(
      resolvePrivateFitEvidenceSourceTrust({
        isRevealed: true,
        trustRating: 5,
        isArchived: true,
      }),
    ).toBe(false);
  });

  it('returns a plain boolean with no forbidden key in sight', () => {
    const result = resolvePrivateFitEvidenceSourceTrust({
      isRevealed: true,
      trustRating: 4,
    });
    expect(typeof result).toBe('boolean');
  });
});

describe('derivePrivateFitEvidence does not auto-consume the source trust resolver', () => {
  it('leaves sourceTrustEligible undefined / missing when not explicitly passed', () => {
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4 },
      sourceRelationId: 'rel-9',
    });
    expect(evidence.sourceTrustEligible).toBeUndefined();
    expect(evidence.missingSignals).toContain('source_not_trust_eligible');
  });

  it('does not call resolvePrivateFitEvidenceSourceTrust internally — only reflects what is passed in', () => {
    // Same isRevealed/trustRating/isArchived shape would resolve to true via
    // resolvePrivateFitEvidenceSourceTrust, but derivePrivateFitEvidence has
    // no way to know that unless the caller passes sourceTrustEligible itself.
    const evidence = derivePrivateFitEvidence({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4 },
      sourceRelationId: 'rel-9',
      // sourceTrustEligible intentionally omitted
    });
    expect(evidence.sourceTrustEligible).toBeUndefined();
  });
});

describe('buildPrivateFitEvidenceSourceContext', () => {
  const eligibleRelation = {
    id: 'rel-1',
    archived: false,
    revealSnapshot: { revealed: true },
  };
  const eligibleEvaluation = { relationId: 'rel-1', ratings: { trust: 5 } };

  it('sourceRelationId absent: returns personalFit/quickSignal, sourceTrustEligible stays undefined', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', quickSignal: { landingLevel: 4 } },
      [],
      [],
    );
    expect(context.personalFit).toBe('kept');
    expect(context.quickSignal).toEqual({ landingLevel: 4 });
    expect(context.sourceTrustEligible).toBeUndefined();
    expect(context.sourceRelationId).toBeUndefined();
  });

  it('sourceRelationId present but no matching relation: id kept opaque, sourceTrustEligible stays undefined', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-ghost' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(context.sourceRelationId).toBe('rel-ghost');
    expect(context.sourceTrustEligible).toBeUndefined();
  });

  it('relation found, revealed, trust >= 4, not archived: sourceTrustEligible true', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(context.sourceTrustEligible).toBe(true);
  });

  it('relation found but not revealed: sourceTrustEligible false', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [{ id: 'rel-1', archived: false, revealSnapshot: { revealed: false } }],
      [eligibleEvaluation],
    );
    expect(context.sourceTrustEligible).toBe(false);
  });

  it('relation found but trust below 4: sourceTrustEligible false', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [{ relationId: 'rel-1', ratings: { trust: 3 } }],
    );
    expect(context.sourceTrustEligible).toBe(false);
  });

  it('relation found but archived: sourceTrustEligible false', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [{ id: 'rel-1', archived: true, revealSnapshot: { revealed: true } }],
      [eligibleEvaluation],
    );
    expect(context.sourceTrustEligible).toBe(false);
  });

  it('relation found but evaluation missing: sourceTrustEligible false (known relation, null trust) — different from a missing relation', () => {
    const contextWithMissingEvaluation = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [], // no evaluation at all for rel-1
    );
    const contextWithMissingRelation = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-ghost' },
      [],
      [],
    );
    expect(contextWithMissingEvaluation.sourceTrustEligible).toBe(false);
    expect(contextWithMissingRelation.sourceTrustEligible).toBeUndefined();
  });

  it('personalFit and quickSignal are passed through unchanged', () => {
    const quickSignal = {
      landingLevel: 5 as const,
      driverDimensions: ['food' as const],
      shareSafe: true,
    };
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'not_for_me', quickSignal },
      [],
      [],
    );
    expect(context.personalFit).toBe('not_for_me');
    expect(context.quickSignal).toEqual(quickSignal);
  });

  it('does not call derivePrivateFitEvidence — no final-evidence-only keys leak into the context', () => {
    const context = buildPrivateFitEvidenceSourceContext(
      { personalFit: 'kept', sourceRelationId: 'rel-1', quickSignal: { landingLevel: 5 } },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(context).not.toHaveProperty('hasExperiencedSignal');
    expect(context).not.toHaveProperty('missingSignals');
    expect(context).not.toHaveProperty('selectedDrivers');
    expect(context).not.toHaveProperty('dimensionSignals');
  });

  it('no forbidden key appears anywhere in the built context', () => {
    const contexts = [
      buildPrivateFitEvidenceSourceContext({ personalFit: 'kept' }, [], []),
      buildPrivateFitEvidenceSourceContext(
        { personalFit: 'kept', sourceRelationId: 'rel-1' },
        [eligibleRelation],
        [eligibleEvaluation],
      ),
    ];
    const forbidden = [...FORBIDDEN_KEY_SUBSTRINGS, 'sourcename', 'recommendedby'];
    for (const context of contexts) {
      for (const key of Object.keys(context)) {
        const lowerKey = key.toLowerCase();
        for (const word of forbidden) {
          expect(lowerKey).not.toContain(word.toLowerCase());
        }
      }
    }
  });
});

describe('deriveRouteObjectUsageSignal', () => {
  const eligibleRelation = {
    id: 'rel-1',
    archived: false,
    revealSnapshot: { revealed: true },
  };
  const eligibleEvaluation = { relationId: 'rel-1', ratings: { trust: 5 } };

  const notEligibleRelation = {
    id: 'rel-2',
    archived: false,
    revealSnapshot: { revealed: false },
  };
  const lowTrustEvaluation = { relationId: 'rel-2', ratings: { trust: 2 } };

  it('1. kept place + eligible source + worldFit/contextFit/wentAgainAt: returns a rich descriptive signal', () => {
    const result = deriveRouteObjectUsageSignal(
      {
        personalFit: 'kept',
        sourceRelationId: 'rel-1',
        worldFit: ['culture', 'travel'],
        quickSignal: { contextFit: ['date', 'calm'] },
        wentAgainAt: '2026-04-01T00:00:00Z',
      },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeDefined();
    expect(result?.fromTrustedRoute).toBe(true);
    expect(result?.worldFit).toEqual(['culture', 'travel']);
    expect(result?.contextFit).toEqual(['date', 'calm']);
    expect(result?.hasDeclaredRepeatVisit).toBe(true);
  });

  it('2. kept place + non-eligible source: returns undefined', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'kept', sourceRelationId: 'rel-2' },
      [notEligibleRelation],
      [lowTrustEvaluation],
    );
    expect(result).toBeUndefined();
  });

  it('3. place without sourceRelationId: fails closed', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'kept' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeUndefined();
  });

  it('4. place with personalFit !== kept: fails closed even with an eligible source', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'saved', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeUndefined();
  });

  it('5. kept place without wentAgainAt: valid partial signal with hasDeclaredRepeatVisit false', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeDefined();
    expect(result?.hasDeclaredRepeatVisit).toBe(false);
  });

  it('6. kept place without contextFit/worldFit but eligible source: valid minimal signal', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeDefined();
    expect(result?.fromTrustedRoute).toBe(true);
    expect(result?.worldFit).toBeUndefined();
    expect(result?.contextFit).toBeUndefined();
  });

  it('7. sourceRelationId is carried opaquely, never resolved to a name', () => {
    const result = deriveRouteObjectUsageSignal(
      { personalFit: 'kept', sourceRelationId: 'rel-1' },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result?.sourceRelationId).toBe('rel-1');
    expect(result).not.toHaveProperty('sourceName');
    expect(result).not.toHaveProperty('relationName');
  });

  it('8. no forbidden key appears in the output', () => {
    const result = deriveRouteObjectUsageSignal(
      {
        personalFit: 'kept',
        sourceRelationId: 'rel-1',
        worldFit: ['culture'],
        quickSignal: {
          landingLevel: 5,
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5 },
          shareSafe: true,
          contextFit: ['friends'],
        },
        wentAgainAt: '2026-04-01T00:00:00Z',
      },
      [eligibleRelation],
      [eligibleEvaluation],
    );
    expect(result).toBeDefined();
    const forbidden = [
      'score',
      'rank',
      'average',
      'recommendation',
      'best',
      'confidence',
      'count',
      'total',
      'percentage',
    ];
    const keys = Object.keys(result as object).map((k) => k.toLowerCase());
    for (const word of forbidden) {
      expect(keys.some((k) => k.includes(word))).toBe(false);
    }
    // Also check nested evidence, if present, for the same forbidden words.
    if (result?.evidence) {
      const evidenceKeys = Object.keys(result.evidence).map((k) => k.toLowerCase());
      for (const word of forbidden) {
        expect(evidenceKeys.some((k) => k.includes(word))).toBe(false);
      }
    }
  });

  it('9. is not imported by anything outside lib/private-fit-evidence.ts and its test', () => {
    // This is a structural doctrine, not something a unit test can check by
    // itself — enforced by the X.48 import scan in the sprint validation
    // (grep across app/*, components/*, store/*). This test documents the
    // intent so the rule is visible alongside the function it protects.
    expect(typeof deriveRouteObjectUsageSignal).toBe('function');
  });
});

describe('deriveRouteObjectUsagePresence', () => {
  const eligibleRelation = {
    id: 'rel-1',
    archived: false,
    revealSnapshot: { revealed: true },
  };
  const eligibleEvaluation = { relationId: 'rel-1', ratings: { trust: 5 } };

  const otherEligibleRelation = {
    id: 'rel-3',
    archived: false,
    revealSnapshot: { revealed: true },
  };
  const otherEligibleEvaluation = { relationId: 'rel-3', ratings: { trust: 4 } };

  const notEligibleRelation = {
    id: 'rel-2',
    archived: false,
    revealSnapshot: { revealed: false },
  };
  const lowTrustEvaluation = { relationId: 'rel-2', ratings: { trust: 2 } };

  const relations = [eligibleRelation, otherEligibleRelation, notEligibleRelation];
  const evaluations = [eligibleEvaluation, otherEligibleEvaluation, lowTrustEvaluation];

  it('1. multiple kept places with eligible sources and varied worldFit/contextFit return deduplicated presence', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-1',
          worldFit: ['culture'],
          quickSignal: { contextFit: ['date'] },
        },
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-3',
          worldFit: ['travel'],
          quickSignal: { contextFit: ['calm'] },
        },
      ],
      relations,
      evaluations,
    );
    // Canonical catalog order (RELATION_OPEN_WORLD_OPTIONS / PLACE_CONTEXT_FIT_OPTIONS),
    // not insertion order — travel precedes culture in the world catalog.
    expect(result.worlds).toEqual(['travel', 'culture']);
    expect(result.contexts).toEqual(['date', 'calm']);
  });

  it('2. multiple places sharing the same world/context never produce a duplicate', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-1',
          worldFit: ['culture'],
          quickSignal: { contextFit: ['date'] },
        },
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-3',
          worldFit: ['culture'],
          quickSignal: { contextFit: ['date'] },
        },
      ],
      relations,
      evaluations,
    );
    expect(result.worlds).toEqual(['culture']);
    expect(result.contexts).toEqual(['date']);
  });

  it('3. a place from a non-eligible source contributes nothing', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-2',
          worldFit: ['culture'],
          quickSignal: { contextFit: ['date'] },
        },
      ],
      relations,
      evaluations,
    );
    expect(result.worlds).toBeUndefined();
    expect(result.contexts).toBeUndefined();
    expect(result.hasAnyDeclaredRepeatVisit).toBe(false);
  });

  it('4. a place without sourceRelationId contributes nothing', () => {
    const result = deriveRouteObjectUsagePresence(
      [{ personalFit: 'kept', worldFit: ['culture'] }],
      relations,
      evaluations,
    );
    expect(result.worlds).toBeUndefined();
    expect(result.hasAnyDeclaredRepeatVisit).toBe(false);
  });

  it('5. a place with personalFit !== kept contributes nothing, even with an eligible source', () => {
    const result = deriveRouteObjectUsagePresence(
      [{ personalFit: 'saved', sourceRelationId: 'rel-1', worldFit: ['culture'] }],
      relations,
      evaluations,
    );
    expect(result.worlds).toBeUndefined();
    expect(result.hasAnyDeclaredRepeatVisit).toBe(false);
  });

  it('6. hasAnyDeclaredRepeatVisit is true if at least one valid place declared a repeat visit', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        { personalFit: 'kept', sourceRelationId: 'rel-1' },
        { personalFit: 'kept', sourceRelationId: 'rel-3', wentAgainAt: '2026-04-01T00:00:00Z' },
      ],
      relations,
      evaluations,
    );
    expect(result.hasAnyDeclaredRepeatVisit).toBe(true);
  });

  it('7. hasAnyDeclaredRepeatVisit is false if no valid place declared a repeat visit', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        { personalFit: 'kept', sourceRelationId: 'rel-1' },
        { personalFit: 'kept', sourceRelationId: 'rel-3' },
      ],
      relations,
      evaluations,
    );
    expect(result.hasAnyDeclaredRepeatVisit).toBe(false);
  });

  it('8. never returns sourceRelationId', () => {
    const result = deriveRouteObjectUsagePresence(
      [{ personalFit: 'kept', sourceRelationId: 'rel-1', worldFit: ['culture'] }],
      relations,
      evaluations,
    );
    expect(result).not.toHaveProperty('sourceRelationId');
  });

  it('9. never returns evidence', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-1',
          quickSignal: { landingLevel: 5, driverDimensions: ['food'], restaurantDimensions: { food: 5 } },
        },
      ],
      relations,
      evaluations,
    );
    expect(result).not.toHaveProperty('evidence');
  });

  it('10. no forbidden key appears anywhere in the output', () => {
    const result = deriveRouteObjectUsagePresence(
      [
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-1',
          worldFit: ['culture'],
          quickSignal: {
            landingLevel: 5,
            driverDimensions: ['food'],
            restaurantDimensions: { food: 5 },
            shareSafe: true,
            contextFit: ['friends'],
          },
          wentAgainAt: '2026-04-01T00:00:00Z',
        },
        {
          personalFit: 'kept',
          sourceRelationId: 'rel-3',
          worldFit: ['travel'],
          quickSignal: { contextFit: ['calm'] },
        },
      ],
      relations,
      evaluations,
    );
    const forbidden = [
      'score',
      'rank',
      'average',
      'recommendation',
      'best',
      'confidence',
      'percentage',
      'count',
      'total',
      'frequency',
      'items',
      'places',
      'sourcerelationid',
      'evidence',
      'landinglevel',
      'dimensionsignals',
    ];
    const keys = Object.keys(result).map((k) => k.toLowerCase());
    for (const word of forbidden) {
      expect(keys.some((k) => k.includes(word))).toBe(false);
    }
  });

  it('returns an empty-but-doctrinally-safe object when no place produces a valid signal', () => {
    const result = deriveRouteObjectUsagePresence([], relations, evaluations);
    expect(result.worlds).toBeUndefined();
    expect(result.contexts).toBeUndefined();
    expect(result.hasAnyDeclaredRepeatVisit).toBe(false);
  });
});
