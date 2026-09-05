import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTEG, DEFAULT_TAUX_USURE } from './computeTEG.mjs'

test('throws without montant_demande or duree_mois', () => {
  assert.throws(() => computeTEG({ duree_mois: 12 }), TypeError)
  assert.throws(() => computeTEG({ montant_demande: 100000 }), TypeError)
})

test('zero nominal rate and zero fees yields a TEG of ~0%', () => {
  const out = computeTEG({ montant_demande: 300000, duree_mois: 12 })
  assert.ok(Math.abs(out.teg) < 0.001, `expected ~0, got ${out.teg}`)
  assert.equal(out.compliant, true)
});

test('with a nominal rate and no fees, the TEG is higher than the nominal rate (monthly compounding)', () => {
  const out = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 18 });
  assert.ok(out.teg > 0.18, `expected TEG > 18%, got ${(out.teg * 100).toFixed(2)}%`);
  assert.ok(out.teg < 0.22, `expected TEG reasonably close to nominal, got ${(out.teg * 100).toFixed(2)}%`);
});

test('adding frais_dossier increases the TEG relative to the same loan without fees', () => {
  const base = { montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 10 };
  const withoutFees = computeTEG(base);
  const withFees = computeTEG({ ...base, frais_dossier: 30000 });
  assert.ok(withFees.teg > withoutFees.teg, `expected fees to raise the TEG (${withoutFees.teg} vs ${withFees.teg})`);
});

test('compliant flips to false once the TEG exceeds the ceiling', () => {
  const cheap = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 5 });
  assert.equal(cheap.compliant, true);

  const expensive = computeTEG({ montant_demande: 300000, duree_mois: 6, taux_nominal_annuel_pct: 60, frais_dossier: 80000 });
  assert.ok(expensive.teg > DEFAULT_TAUX_USURE, `expected an over-the-ceiling TEG, got ${expensive.teg}`);
  assert.equal(expensive.compliant, false);
});

test('a custom plafond overrides the default ceiling', () => {
  const out = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 18, plafond: 0.15 });
  assert.equal(out.plafond, 0.15);
  assert.equal(out.compliant, out.teg <= 0.15);
});

test('valide is false when taux_nominal_annuel_pct or plafond were never provided (Lory Rev.2 §7: "contrôle non validé")', () => {
  const noneProvided = computeTEG({ montant_demande: 300000, duree_mois: 12 });
  assert.equal(noneProvided.valide, false);

  const onlyTaux = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 18 });
  assert.equal(onlyTaux.valide, false);

  const bothProvided = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 18, plafond: 0.24 });
  assert.equal(bothProvided.valide, true);
});

test('an explicit 0% rate is a real, valid input, not treated as "not provided"', () => {
  const out = computeTEG({ montant_demande: 300000, duree_mois: 12, taux_nominal_annuel_pct: 0, plafond: 0.24 });
  assert.equal(out.valide, true);
});
