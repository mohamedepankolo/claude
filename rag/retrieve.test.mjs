import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, search } from './retrieve.mjs'
import { CORPUS } from './corpus.mjs'

const index = buildIndex(CORPUS)

test('the corpus produces a non-empty index', () => {
  assert.ok(index.chunks.length > 5, `expected several chunks, got ${index.chunks.length}`)
});

test('searching "taux d\'usure" surfaces the usury-rate document first', () => {
  const results = search("taux d'usure applicable", index, 3)
  assert.ok(results.length > 0)
  assert.equal(results[0].source, 'taux-usure-sfd-bceao-2026')
});

test('searching "comment est calculé le TEG" surfaces the methodology document', () => {
  const results = search('comment est calculé le TEG bissection', index, 3)
  assert.ok(results.length > 0)
  assert.equal(results[0].source, 'teg-methode-calcul')
});

test('searching "primo-demandeur cold start caution" surfaces the credit policy document', () => {
  const results = search('primo-demandeur cold start caution garantie', index, 3)
  assert.ok(results.length > 0)
  assert.equal(results[0].source, 'politique-credit-fictive')
});

test('an unrelated query returns no results rather than a forced weak match', () => {
  const results = search('recette de cuisine ingrédients pâtisserie', index, 3)
  assert.equal(results.length, 0)
});

test('results are capped at k', () => {
  const results = search('crédit taux montant dossier', index, 2)
  assert.ok(results.length <= 2)
});
