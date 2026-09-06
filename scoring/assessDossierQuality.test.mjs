import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessDossierQuality, CHAMPS_SUIVIS } from './assessDossierQuality.mjs'

const completDossier = () => ({
  age: 38, personnes_a_charge: 2,
  capacite_caution: 0.7, anciennete_membre_mois: 24, montant_dernier_credit: 200000,
  endettement_externe_declare: 0, valeur_garantie: 500000, croissance_ventes_pct: 5,
  chiffre_affaires: 500000, charges_activite: 200000, montant_demande: 600000,
  duree_mois: 18, anciennete_activite_mois: 24, secteur: 'commerce_detail',
})

test('throws without an input object', () => {
  assert.throws(() => assessDossierQuality(null), TypeError)
})

test('a fully filled, coherent dossier scores full completeness with no alerts', () => {
  const out = assessDossierQuality(completDossier())
  assert.equal(out.qualite_pct, 100)
  assert.deepEqual(out.champs_manquants, [])
  assert.deepEqual(out.alertes, [])
})

test('missing tracked fields (null, as sent by the form when left empty) reduce completeness proportionally', () => {
  const dossier = { ...completDossier(), age: null, anciennete_membre_mois: null }
  const out = assessDossierQuality(dossier)
  assert.equal(out.champs_manquants.length, 2)
  assert.equal(out.qualite_pct, Math.round(100 * (1 - 2 / CHAMPS_SUIVIS.length)))
})

test('a genuine zero value is never treated as missing (0 !== null)', () => {
  const dossier = { ...completDossier(), endettement_externe_declare: 0, croissance_ventes_pct: 0 }
  const out = assessDossierQuality(dossier)
  assert.deepEqual(out.champs_manquants, [])
})

test('zero or negative declared profit triggers a reliability alert', () => {
  const out = assessDossierQuality({ ...completDossier(), chiffre_affaires: 100000, charges_activite: 150000 })
  assert.ok(out.alertes.some((a) => a.includes('Bénéfice mensuel')))
})

test('a requested amount wildly disproportionate to declared income triggers an alert', () => {
  const out = assessDossierQuality({ ...completDossier(), montant_demande: 100000000 })
  assert.ok(out.alertes.some((a) => a.includes('très supérieur')))
})

test('activity younger than the financing threshold triggers an alert', () => {
  const out = assessDossierQuality({ ...completDossier(), anciennete_activite_mois: 3 })
  assert.ok(out.alertes.some((a) => a.includes('seuil finançable')))
})

test('a duration outside the usual model range triggers an alert', () => {
  const out = assessDossierQuality({ ...completDossier(), duree_mois: 60 })
  assert.ok(out.alertes.some((a) => a.includes('plage usuelle')))
})

test('an under-represented sector triggers an alert without any missing-field penalty', () => {
  const out = assessDossierQuality({ ...completDossier(), secteur: 'agriculture' })
  assert.ok(out.alertes.some((a) => a.includes('agriculture')))
  assert.deepEqual(out.champs_manquants, [])
})

test('quality never goes below zero however many missing fields and alerts stack up', () => {
  const out = assessDossierQuality({ secteur: 'agriculture', chiffre_affaires: 0, charges_activite: 0, montant_demande: 900000000, anciennete_activite_mois: 1, duree_mois: 96 })
  assert.ok(out.qualite_pct >= 0)
})

test('this module never returns anything resembling the deprecated "confidence" field', () => {
  const out = assessDossierQuality(completDossier())
  assert.ok(!('confidence' in out))
  assert.ok(!('confiance' in out))
})
