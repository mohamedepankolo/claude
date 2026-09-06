import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBusinessGuardrails, DECISIONS_ORDER } from './applyBusinessGuardrails.mjs'

const baseScore = () => ({
  score: 80, risk_level: 'low', confidence: 0.9, recommended_amount: 300000,
  decision: 'approve', explanations: [{ code: 'x', label: 'X', direction: 'favorable', weight: 1, detail: 'x' }],
  narrative: ['ok'],
})

test('throws without montant_demande', () => {
  assert.throws(() => applyBusinessGuardrails(baseScore(), {}), TypeError)
})

test('a clean context leaves decision, amount and explanations untouched, guardrails empty', () => {
  const score = baseScore()
  const out = applyBusinessGuardrails(score, { montant_demande: 300000, benefice_activite: 200000 })
  assert.equal(out.decision, 'approve')
  assert.equal(out.recommended_amount, 300000)
  assert.equal(out.explanations, score.explanations, 'explanations must be the same reference, never rewritten')
  assert.deepEqual(out.guardrails, [])
})

test('guardrails never soften a decision, only harden it (reject stays reject)', () => {
  const score = { ...baseScore(), decision: 'reject' }
  const out = applyBusinessGuardrails(score, { montant_demande: 300000, endettement_externe_declare: 900000, benefice_activite: 100000 })
  assert.equal(out.decision, 'reject')
  assert.ok(out.guardrails.some((g) => g.code === 'endettement_externe_eleve'))
})

test('high external debt relative to income escalates approve to review (P0)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, benefice_activite: 100000, endettement_externe_declare: 200000 })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails[0].code, 'endettement_externe_eleve')
})

test('a brand-new member gets recommended_amount capped, decision untouched (P0)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, anciennete_membre_mois: 2 })
  assert.equal(out.recommended_amount, Math.round(300000 * 0.7))
  assert.equal(out.decision, 'approve')
  assert.equal(out.guardrails[0].code, 'nouveau_membre')
})

test('an established member (>= threshold) is not capped (P0)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, anciennete_membre_mois: 24 })
  assert.equal(out.recommended_amount, 300000)
  assert.deepEqual(out.guardrails, [])
})

test('a disproportionate request vs credit history escalates to review and caps the amount (P0 — progressivité)', () => {
  const score = { ...baseScore(), recommended_amount: 8000000 }
  const out = applyBusinessGuardrails(score, { montant_demande: 10000000, montant_dernier_credit: 500000 })
  assert.equal(out.decision, 'review')
  assert.equal(out.recommended_amount, 1500000)
  assert.ok(out.guardrails.some((g) => g.code === 'progressivite_credit'))
})

test('a progressive request (within 3x the last credit) triggers nothing (P0)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 1200000, montant_dernier_credit: 500000 })
  assert.deepEqual(out.guardrails, [])
})

test('a duration outside the norm for its credit type is flagged informational only, never escalates (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, duree_mois: 36, type_credit: 'credit_communautaire' })
  assert.equal(out.decision, 'approve')
  assert.equal(out.guardrails[0].code, 'duree_hors_norme')
})

test('an under-covered guarantee escalates to review (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 1000000, type_garantie: 'materiel', valeur_garantie: 200000 })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails[0].code, 'garantie_insuffisante')
})

test('no guarantee declared never triggers the guarantee guardrail (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 1000000, type_garantie: 'aucune' })
  assert.deepEqual(out.guardrails, [])
})

test('an unfavorable seasonal timing judgment escalates to review (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, pertinence_demande: 'defavorable' })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails[0].code, 'timing_defavorable')
})

test('a favorable seasonal judgment triggers nothing (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, pertinence_demande: 'favorable' })
  assert.deepEqual(out.guardrails, [])
})

test('a strong sales decline escalates to review (P1)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, croissance_ventes_pct: -35 })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails[0].code, 'ventes_en_declin')
})

test('a locally-detected duplicate active dossier escalates to review (P2 proxy)', () => {
  const out = applyBusinessGuardrails(baseScore(), { montant_demande: 300000, duplicate_active_client: true })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails[0].code, 'doublon_dossier_local')
})

test('multiple triggered guardrails all accumulate and the worst decision wins', () => {
  const out = applyBusinessGuardrails(baseScore(), {
    montant_demande: 10000000,
    montant_dernier_credit: 500000,
    type_garantie: 'materiel', valeur_garantie: 100000,
    duplicate_active_client: true,
  })
  assert.equal(out.decision, 'review')
  assert.equal(out.guardrails.length, 3)
})

test('DECISIONS_ORDER reflects approve < review < reject', () => {
  assert.ok(DECISIONS_ORDER.approve < DECISIONS_ORDER.review)
  assert.ok(DECISIONS_ORDER.review < DECISIONS_ORDER.reject)
})
