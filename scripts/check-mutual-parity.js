#!/usr/bin/env node
require('sucrase/register/ts');

const { computeMutualRelationshipScore } = require('../lib/evaluation.ts');

/** @type {{id:string; label:string; ratingsA:any; ratingsB:any; expected:{score:number; tier:string}}[]} */
const CASES = [
  {
    id: 'strong_aligned',
    label: 'Strong aligned case',
    ratingsA: { trust: 5, support: 5, interactions: 4, affinity: 4, sharedNetwork: 3 },
    ratingsB: { trust: 5, support: 4, interactions: 4, affinity: 4, sharedNetwork: 3 },
    expected: { score: 86, tier: 'Anchor' },
  },
  {
    id: 'strong_asymmetric',
    label: 'Strongly asymmetric case',
    ratingsA: { trust: 5, support: 5, interactions: 5, affinity: 4, sharedNetwork: 4 },
    ratingsB: { trust: 2, support: 2, interactions: 3, affinity: 3, sharedNetwork: 2 },
    expected: { score: 34, tier: 'Ghost' },
  },
  {
    id: 'trust_critical_cap',
    label: 'Trust-critical cap case',
    ratingsA: { trust: 2, support: 5, interactions: 5, affinity: 4, sharedNetwork: 4 },
    ratingsB: { trust: 5, support: 5, interactions: 4, affinity: 4, sharedNetwork: 3 },
    expected: { score: 59, tier: 'Thrill' },
  },
  {
    id: 'both_interactions_low_cap',
    label: 'Both interactions low cap case',
    ratingsA: { trust: 5, support: 4, interactions: 2, affinity: 4, sharedNetwork: 3 },
    ratingsB: { trust: 4, support: 4, interactions: 2, affinity: 3, sharedNetwork: 3 },
    expected: { score: 63, tier: 'Thrill' },
  },
];

let failures = 0;
console.log('Mutual scoring parity check\n');

for (const testCase of CASES) {
  const result = computeMutualRelationshipScore(testCase.ratingsA, testCase.ratingsB);
  const scoreMatches = result.finalScore === testCase.expected.score;
  const tierMatches = result.tier === testCase.expected.tier;
  const pass = scoreMatches && tierMatches;

  if (!pass) failures += 1;

  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${testCase.id} | expected ${testCase.expected.score}/${testCase.expected.tier} | got ${result.finalScore}/${result.tier}`,
  );
}

console.log(`\nSummary: ${CASES.length - failures}/${CASES.length} cases passed.`);
if (failures > 0) {
  process.exitCode = 1;
}
