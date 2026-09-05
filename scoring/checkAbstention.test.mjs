import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAbstention } from './checkAbstention.mjs'

const validDossier = () => ({
  montant_demande: 600000, chiffre_affaires: 500000, secteur: 'commerce_detail',
  duree_mois: 18, anciennete_activite_mois: 24,
})

test('throws without an input object', () => {
  assert.throws(() => checkAbstention(null), TypeError)
})

test('a complete, in-domain dossier never abstains', () => {
  const out = checkAbstention(validDossier())
  assert.equal(out.abstention, false)
  assert.deepEqual(out.motifs, [])
})

test('a missing critical field triggers abstention with a named motif', () => {
  const out = checkAbstention({ ...validDossier(), montant_demande: null })
  assert.equal(out.abstention, true)
  assert.ok(out.motifs.some((m) => m.includes('Montant demandé')))
})

test('a zero or negative critical numeric field is treated as invalid, not a real value', () => {
  const out = checkAbstention({ ...validDossier(), chiffre_affaires: 0 })
  assert.equal(out.abstention, true)
  assert.ok(out.motifs.some((m) => m.includes("Chiffre d'affaires")))
})

test('an empty secteur is caught as a missing critical field, not as an unknown-sector motif', () => {
  const out = checkAbstention({ ...validDossier(), secteur: '' })
  assert.equal(out.abstention, true)
  assert.ok(out.motifs.some((m) => m.includes("Secteur d'activité")))
})

test('a sector outside the trained model is flagged as out of domain', () => {
  const out = checkAbstention({ ...validDossier(), secteur: 'transport' })
  assert.equal(out.abstention, true)
  assert.ok(out.motifs.some((m) => m.includes('non couvert')))
})

test('activity younger than the financing threshold triggers abstention, not just a warning', () => {
  const out = checkAbstention({ ...validDossier(), anciennete_activite_mois: 3 })
  assert.equal(out.abstention, true)
  assert.ok(out.motifs.some((m) => m.includes('seuil finançable')))
})

test('activity exactly at the threshold does not abstain', () => {
  const out = checkAbstention({ ...validDossier(), anciennete_activite_mois: 6 })
  assert.equal(out.abstention, false)
})

test('multiple problems accumulate into multiple distinct motifs', () => {
  const out = checkAbstention({ montant_demande: null, chiffre_affaires: null, secteur: 'transport', duree_mois: 12 })
  assert.equal(out.abstention, true)
  assert.equal(out.motifs.length, 3)
})
