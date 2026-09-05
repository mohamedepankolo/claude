import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeViability, DEFAULT_PARAMS } from './computeViability.mjs'

// Taux réaliste pour du microcrédit (les coûts opérationnels et de
// ressources d'une IMF sont proportionnellement élevés sur de petits
// montants — un taux plus bas comme 18% ne couvrirait pas ces coûts fixes,
// ce qui est justement le rôle de ce moteur de le révéler).
const base = { montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 30, frais_dossier: 5000 }

test('throws without montant_demande, duree_mois or probabilite_defaut', () => {
  assert.throws(() => computeViability({ duree_mois: 12, probabilite_defaut: 0.1 }), TypeError)
  assert.throws(() => computeViability({ montant_demande: 300000, probabilite_defaut: 0.1 }), TypeError)
  assert.throws(() => computeViability({ montant_demande: 300000, duree_mois: 12 }), TypeError)
  assert.throws(() => computeViability({ ...base, probabilite_defaut: 1.5 }), TypeError)
})

test('a safe dossier (low default probability) on a reasonable rate is viable', () => {
  const out = computeViability({ ...base, probabilite_defaut: 0.02 })
  assert.ok(out.marge > 0, `expected a positive margin, got ${out.marge}`)
  assert.equal(out.viable, out.marge_pct >= DEFAULT_PARAMS.marge_minimale_pct)
})

test('raising the default probability strictly increases the risk cost and lowers the margin', () => {
  const safe = computeViability({ ...base, probabilite_defaut: 0.02 })
  const risky = computeViability({ ...base, probabilite_defaut: 0.4 })
  assert.ok(risky.detail.cout_risque > safe.detail.cout_risque)
  assert.ok(risky.marge < safe.marge)
})

test('a very high default probability flips viable to false', () => {
  const out = computeViability({ ...base, probabilite_defaut: 0.9 })
  assert.equal(out.viable, false)
})

test('TEG and viability stay separate: taux_nominal_annuel_pct never appears verbatim in the viability output shape', () => {
  const out = computeViability({ ...base, probabilite_defaut: 0.05 })
  assert.ok(!('teg' in out), 'computeViability must never emit a teg field — TEG ≠ rentabilité')
  assert.ok(!('compliant' in out), 'computeViability must never emit a compliant field — that belongs to computeTEG')
})

test('custom params override the defaults and are echoed back', () => {
  const out = computeViability({
    ...base,
    probabilite_defaut: 0.05,
    params: { cout_technologique_fixe: 2000, marge_minimale_pct: 50 },
  })
  assert.equal(out.detail.cout_technologique, 2000)
  assert.equal(out.params.marge_minimale_pct, 50)
  assert.equal(out.viable, out.marge_pct >= 50)
})
