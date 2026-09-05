import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCreditApplication, RISK_LEVELS, DECISIONS } from './scoreCreditApplication.mjs';

test('throws without application_id', () => {
  assert.throws(() => scoreCreditApplication({ income: 1000 }), TypeError);
});

test('throws without an input object', () => {
  assert.throws(() => scoreCreditApplication(), TypeError);
});

test('strong repeat-borrower dossier is approved with high confidence', () => {
  const out = scoreCreditApplication({
    application_id: 'app-1',
    amount_requested: 300000,
    duration: 12,
    income: 500000 * 0.4,
    expenses: 5000,
    business_age: 36,
    savings: 1,
    guarantee: 1,
    history: { has_prior_credit: true, incidents_last_12m: 0, repayment_rate_pct: 98 },
    profile: { reputation: 'good', guarantor_strength: 'good', sector_dynamics: 'favorable', agency_distance_km: 1 },
  });
  assert.equal(out.decision, DECISIONS.APPROVE);
  assert.equal(out.risk_level, RISK_LEVELS.LOW);
  assert.ok(out.score >= 70, `expected score >= 70, got ${out.score}`);
  assert.ok(out.confidence > 0.7, `expected high confidence, got ${out.confidence}`);
  assert.ok(out.recommended_amount > 0);
  assert.ok(Array.isArray(out.explanations) && out.explanations.length > 0);
  assert.ok(Array.isArray(out.narrative) && out.narrative.length > 0);
});

test('over-indebted, unstable dossier is rejected', () => {
  const out = scoreCreditApplication({
    application_id: 'app-2',
    amount_requested: 600000,
    duration: 6,
    income: 60000 * 0.15,
    expenses: 20000,
    business_age: 2,
    savings: 0,
    guarantee: 0,
    profile: { reputation: 'to_verify', sector_dynamics: 'difficult', agency_distance_km: 15 },
  });
  assert.equal(out.decision, DECISIONS.REJECT);
  assert.equal(out.risk_level, RISK_LEVELS.HIGH);
  assert.ok(out.score < 40, `expected score < 40, got ${out.score}`);
});

test('cold start (no prior credit) uses the substitute weighting and lowers confidence', () => {
  const withHistory = scoreCreditApplication({
    application_id: 'app-3a',
    amount_requested: 300000, duration: 12, income: 250000, expenses: 5000, business_age: 18,
    savings: 1, guarantee: 1,
    history: { has_prior_credit: true, incidents_last_12m: 0, repayment_rate_pct: 95 },
    profile: { reputation: 'good', guarantor_strength: 'good', sector_dynamics: 'favorable', agency_distance_km: 2 },
  });
  const coldStart = scoreCreditApplication({
    application_id: 'app-3b',
    amount_requested: 300000, duration: 12, income: 250000, expenses: 5000, business_age: 18,
    savings: 1, guarantee: 1,
    profile: { reputation: 'good', guarantor_strength: 'good', sector_dynamics: 'favorable', agency_distance_km: 2 },
  });
  assert.ok(coldStart.confidence < withHistory.confidence);
  assert.ok(!coldStart.explanations.some((e) => e.code === 'history'));
});

test('recommended_amount never exceeds ~115% of the requested amount', () => {
  const out = scoreCreditApplication({
    application_id: 'app-4',
    amount_requested: 100000, duration: 12, income: 5000000, expenses: 0, business_age: 60,
    savings: 1, guarantee: 1,
    history: { has_prior_credit: true, incidents_last_12m: 0, repayment_rate_pct: 100 },
    profile: { reputation: 'good', guarantor_strength: 'good', sector_dynamics: 'favorable', agency_distance_km: 0 },
  });
  assert.ok(out.recommended_amount <= 100000 * 1.15);
});

test('output shape matches the contract exactly', () => {
  const out = scoreCreditApplication({
    application_id: 'app-5', amount_requested: 200000, duration: 10, income: 150000, expenses: 10000, business_age: 10,
  });
  const keys = Object.keys(out).sort();
  assert.deepEqual(keys, ['confidence', 'decision', 'explanations', 'narrative', 'recommended_amount', 'risk_level', 'score'].sort());
  assert.equal(typeof out.score, 'number');
  assert.ok(['low', 'medium', 'high'].includes(out.risk_level));
  assert.ok(['approve', 'review', 'reject'].includes(out.decision));
  assert.equal(typeof out.confidence, 'number');
  assert.equal(typeof out.recommended_amount, 'number');
  for (const e of out.explanations) {
    assert.equal(typeof e.code, 'string');
    assert.equal(typeof e.label, 'string');
    assert.ok(['favorable', 'unfavorable'].includes(e.direction));
    assert.equal(typeof e.weight, 'number');
    assert.equal(typeof e.detail, 'string');
  }
});
