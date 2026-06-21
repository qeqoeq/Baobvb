import { describe, expect, it } from 'vitest';

import {
  derivePrivateRouteObjectFit,
  type PrivateRouteObjectFitRouteContext,
} from './private-route-object-fit';
import type { PrivateObjectFit } from './private-object-fit';

function usableObjectFit(overrides: Partial<PrivateObjectFit> = {}): PrivateObjectFit {
  return {
    value: 0.9,
    confidence: 0.6,
    evidenceCount: 8,
    dimensions: {
      category: { value: 1, confidence: 0.5, evidenceCount: 6 },
      context: { value: 1, confidence: 0.5, evidenceCount: 6 },
    },
    status: 'usable',
    reasons: [],
    ...overrides,
  };
}

function insufficientObjectFit(): PrivateObjectFit {
  return {
    value: 0,
    confidence: 0,
    evidenceCount: 0,
    dimensions: {},
    status: 'insufficient_evidence',
    reasons: ['no_computable_dimensions'],
  };
}

function trustedRoute(overrides: Partial<PrivateRouteObjectFitRouteContext> = {}): PrivateRouteObjectFitRouteContext {
  return {
    isRevealed: true,
    trustRating: 4,
    isArchived: false,
    ...overrides,
  };
}

describe('derivePrivateRouteObjectFit', () => {
  it('1. objectFit insufficient → status insufficient_evidence', () => {
    const result = derivePrivateRouteObjectFit(insufficientObjectFit(), trustedRoute());
    expect(result.status).toBe('insufficient_evidence');
  });

  it('2. objectFit insufficient → route.status not_evaluated', () => {
    const result = derivePrivateRouteObjectFit(insufficientObjectFit(), trustedRoute());
    expect(result.route.status).toBe('not_evaluated');
  });

  it('3. objectFit insufficient → route trust never evaluated even if the route would be usable', () => {
    const veryTrustedRoute = trustedRoute({ trustRating: 5, isRevealed: true, isArchived: false });
    const result = derivePrivateRouteObjectFit(insufficientObjectFit(), veryTrustedRoute);
    expect(result.route.status).toBe('not_evaluated');
    expect(result.route.reasons).toEqual(['object_fit_insufficient']);
    expect(result.reasons).toEqual(['object_fit_insufficient']);
  });

  it('4. objectFit usable + isRevealed false → blocked', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute({ isRevealed: false }));
    expect(result.status).toBe('blocked');
    expect(result.route.status).toBe('blocked');
  });

  it('5. objectFit usable + trustRating < 4 → blocked', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute({ trustRating: 3 }));
    expect(result.status).toBe('blocked');
  });

  it('6. objectFit usable + isArchived true → blocked', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute({ isArchived: true }));
    expect(result.status).toBe('blocked');
  });

  it('7. objectFit usable + route usable → usable', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute());
    expect(result.status).toBe('usable');
    expect(result.route.status).toBe('usable');
  });

  it('8. route usable preserves confidence = objectFit.confidence', () => {
    const objectFit = usableObjectFit({ confidence: 0.42 });
    const result = derivePrivateRouteObjectFit(objectFit, trustedRoute());
    expect(result.confidence).toBe(0.42);
  });

  it('9. high trust never increases objectFit.value', () => {
    const objectFit = usableObjectFit({ value: 0.5 });
    const lowTrust = derivePrivateRouteObjectFit(objectFit, trustedRoute({ trustRating: 4 }));
    const highTrust = derivePrivateRouteObjectFit(objectFit, trustedRoute({ trustRating: 5 }));
    expect(lowTrust.objectFit.value).toBe(0.5);
    expect(highTrust.objectFit.value).toBe(0.5);
  });

  it('10. high trust never increases confidence beyond objectFit.confidence', () => {
    const objectFit = usableObjectFit({ confidence: 0.4 });
    const trustRating4 = derivePrivateRouteObjectFit(objectFit, trustedRoute({ trustRating: 4 }));
    const trustRating5 = derivePrivateRouteObjectFit(objectFit, trustedRoute({ trustRating: 5 }));
    expect(trustRating4.confidence).toBe(0.4);
    expect(trustRating5.confidence).toBe(0.4);
  });

  it('11. a weak objectFit cannot be rescued by trust', () => {
    const result = derivePrivateRouteObjectFit(insufficientObjectFit(), trustedRoute({ trustRating: 5 }));
    expect(result.status).toBe('insufficient_evidence');
  });

  it('12. a blocked route preserves the objectFit entirely unchanged', () => {
    const objectFit = usableObjectFit();
    const result = derivePrivateRouteObjectFit(objectFit, trustedRoute({ isArchived: true }));
    expect(result.objectFit).toEqual(objectFit);
  });

  it('13. no root-level value field in the output', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute());
    expect(result).not.toHaveProperty('value');
  });

  it('14. no sourceRelationId in the output', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute());
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('sourcerelationid');
  });

  it('15. no source name in the output', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute());
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('sourcename');
    expect(json).not.toContain('relationname');
  });

  it('16. no recommendation/recommended/rank/best/send/candidate field', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute());
    const json = JSON.stringify(result).toLowerCase();
    for (const forbidden of ['recommend', 'rank', 'best', 'send', 'candidate']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('17. no moral label of a person', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute({ isArchived: true }));
    const json = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      'goodtaste',
      'badtaste',
      'strict',
      'generous',
      'reliable',
      'difficult',
      'picky',
      'premiumtaste',
      'lowtaste',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('18. is deterministic — same inputs always yield the same output', () => {
    const objectFit = usableObjectFit();
    const route = trustedRoute();
    const first = derivePrivateRouteObjectFit(objectFit, route);
    const second = derivePrivateRouteObjectFit(objectFit, route);
    expect(first).toEqual(second);
  });

  it('19. implementation imports no UI/store/Supabase module', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'private-route-object-fit.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/from ['"]@?\/?app\//);
    expect(source).not.toMatch(/from ['"]@?\/?components\//);
    expect(source).not.toMatch(/from ['"].*useRelationsStore['"]/);
    expect(source).not.toMatch(/supabase/i);
  });

  it('20. implementation has no AI/recommendation/candidate references in types or code', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'private-route-object-fit.ts'),
      'utf-8',
    );
    const codeOnly = source
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(codeOnly.toLowerCase()).not.toMatch(/\b(ai|recommendation|candidate)\b/);
  });

  it('21. route reasons are internal snake_case codes only', () => {
    const result = derivePrivateRouteObjectFit(usableObjectFit(), trustedRoute({ isArchived: true, isRevealed: false, trustRating: 1 }));
    for (const reason of result.route.reasons) {
      expect(reason).toMatch(/^[a-z_]+$/);
      expect(reason).not.toContain(' ');
    }
  });

  it('22. revealed + trust 4 + not archived passes', () => {
    const result = derivePrivateRouteObjectFit(
      usableObjectFit(),
      { isRevealed: true, trustRating: 4, isArchived: false },
    );
    expect(result.status).toBe('usable');
  });

  it('23. revealed + trust 5 + not archived passes', () => {
    const result = derivePrivateRouteObjectFit(
      usableObjectFit(),
      { isRevealed: true, trustRating: 5, isArchived: false },
    );
    expect(result.status).toBe('usable');
  });

  it('24. archived blocks even with trust 5', () => {
    const result = derivePrivateRouteObjectFit(
      usableObjectFit(),
      { isRevealed: true, trustRating: 5, isArchived: true },
    );
    expect(result.status).toBe('blocked');
  });

  it('25. not revealed blocks even with trust 5', () => {
    const result = derivePrivateRouteObjectFit(
      usableObjectFit(),
      { isRevealed: false, trustRating: 5, isArchived: false },
    );
    expect(result.status).toBe('blocked');
  });
});
