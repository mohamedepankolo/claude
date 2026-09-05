import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchEntityEvents, dedupeByFingerprint } from './matchEntity.mjs'
import { SYNTHETIC_FEED } from './syntheticFeed.mjs'

test('throws without entity.nom or a non-array feed', () => {
  assert.throws(() => matchEntityEvents({}, SYNTHETIC_FEED), TypeError)
  assert.throws(() => matchEntityEvents({ nom: 'x' }, null), TypeError)
})

test('no match returns statut aucun_resultat, never a false positive', () => {
  const out = matchEntityEvents({ nom: 'Entreprise Inexistante' }, SYNTHETIC_FEED)
  assert.equal(out.statut, 'aucun_resultat')
  assert.deepEqual(out.evenements, [])
})

test('name-only match without corroboration is flagged as a possible homonym, not confirmed', () => {
  const out = matchEntityEvents({ nom: 'Comptoir Fictif du Sahel' }, SYNTHETIC_FEED)
  assert.equal(out.statut, 'trouve')
  assert.ok(out.evenements.every((e) => e.qualite_rapprochement === 'nom_seul_homonyme_possible'))
})

test('name + matching sector corroborates the match', () => {
  const out = matchEntityEvents({ nom: 'Comptoir Fictif du Sahel', secteur: 'commerce_detail' }, SYNTHETIC_FEED)
  assert.ok(out.evenements.every((e) => e.qualite_rapprochement === 'nom_et_secteur'))
})

test('name + matching zone corroborates the match', () => {
  const out = matchEntityEvents({ nom: 'Comptoir Fictif du Sahel', zone: 'Ouagadougou' }, SYNTHETIC_FEED)
  assert.ok(out.evenements.every((e) => e.qualite_rapprochement === 'nom_et_localite'))
})

test('a matching name but a different sector does not silently upgrade to corroborated', () => {
  const out = matchEntityEvents({ nom: 'Comptoir Fictif du Sahel', secteur: 'agriculture' }, SYNTHETIC_FEED)
  assert.ok(out.evenements.every((e) => e.qualite_rapprochement === 'nom_seul_homonyme_possible'))
})

test('matching is accent/case-insensitive but never a mere substring resemblance', () => {
  const out = matchEntityEvents({ nom: 'comptoir fictif du sahel' }, SYNTHETIC_FEED)
  assert.equal(out.statut, 'trouve')
  const partial = matchEntityEvents({ nom: 'Comptoir Fictif' }, SYNTHETIC_FEED)
  assert.equal(partial.statut, 'aucun_resultat')
})

test('dedupeByFingerprint collapses a republished event and counts repeats, never as independent confirmations', () => {
  const out = matchEntityEvents({ nom: 'Comptoir Fictif du Sahel' }, SYNTHETIC_FEED)
  const deduped = dedupeByFingerprint(out.evenements)
  const retard = deduped.find((e) => e.type === 'retard_salarial')
  assert.equal(retard.nb_reprises, 1)
  assert.equal(retard.date_publication, '2026-07-20') // la plus ancienne des deux publications
  assert.equal(deduped.length, 2) // retard_salarial (dédoublonné) + fermeture
})
