import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scoreCreditApplication, RISK_LEVELS, DECISIONS } from './scoreCreditApplication.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSampleRows() {
  const csv = readFileSync(path.join(__dirname, '../data/echantillon_40.csv'), 'utf-8').trim().split(/\r?\n/);
  const header = csv[0].split(',').map((h) => h.trim());
  return csv.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function rowToInput(row, id) {
  const num = (k) => Number(row[k]);
  return {
    application_id: id,
    age: num('age'),
    zone: row.zone,
    secteur: row.secteur,
    informel: num('informel'),
    personnes_a_charge: num('personnes_a_charge'),
    anciennete_activite_mois: num('anciennete_activite_mois'),
    chiffre_affaires: num('chiffre_affaires'),
    charges_activite: num('charges_activite'),
    benefice_activite: num('revenu_activite'), // colonne d'origine de Prisca, renommée côté contrat
    charges_perso: num('charges_perso'),
    montant_demande: num('montant_demande'),
    duree_mois: num('duree_mois'),
    a_historique: num('a_historique'),
    nb_credits_anterieurs: num('nb_credits_anterieurs'),
    nb_retards: num('nb_retards'),
    deja_impaye: num('deja_impaye'),
    a_caution: num('a_caution'),
    capacite_caution: num('capacite_caution'),
    score_moralite: num('score_reputation'), // colonne d'origine de Prisca, renommée côté contrat
  };
}

test('throws without application_id or secteur', () => {
  assert.throws(() => scoreCreditApplication({ montant_demande: 1000 }), TypeError);
  assert.throws(() => scoreCreditApplication({ application_id: 'a', montant_demande: 1000 }), TypeError);
});

test('output shape matches the contract exactly', () => {
  const out = scoreCreditApplication({
    application_id: 'x1', secteur: 'commerce_detail', montant_demande: 300000, duree_mois: 12,
    chiffre_affaires: 500000, charges_activite: 200000, anciennete_activite_mois: 24,
  });
  const keys = Object.keys(out).sort();
  assert.deepEqual(keys, ['confidence', 'decision', 'explanations', 'narrative', 'recommended_amount', 'risk_level', 'score'].sort());
  assert.ok(['low', 'medium', 'high'].includes(out.risk_level));
  assert.ok(['approve', 'review', 'reject'].includes(out.decision));
  assert.ok(out.confidence >= 0 && out.confidence <= 1);
  for (const e of out.explanations) {
    assert.equal(typeof e.code, 'string');
    assert.equal(typeof e.label, 'string');
    assert.ok(['favorable', 'unfavorable'].includes(e.direction));
    assert.equal(typeof e.detail, 'string');
  }
});

test('a well-off, low-debt-ratio dossier with a clean history scores low risk', () => {
  const out = scoreCreditApplication({
    application_id: 'good-1', secteur: 'services', zone: 'urbain',
    montant_demande: 300000, duree_mois: 18,
    chiffre_affaires: 1500000, charges_activite: 400000, anciennete_activite_mois: 48,
    a_historique: 1, nb_credits_anterieurs: 2, nb_retards: 0, deja_impaye: 0,
    a_caution: 1, capacite_caution: 0.9, score_moralite: 0.9,
  });
  assert.equal(out.decision, DECISIONS.APPROVE);
  assert.equal(out.risk_level, RISK_LEVELS.LOW);
});

test('a heavily-indebted dossier with a bad repayment history scores high risk', () => {
  const out = scoreCreditApplication({
    application_id: 'bad-1', secteur: 'quincaillerie_materiaux', zone: 'rural',
    montant_demande: 2000000, duree_mois: 6,
    chiffre_affaires: 300000, charges_activite: 270000, anciennete_activite_mois: 8,
    a_historique: 1, nb_credits_anterieurs: 1, nb_retards: 6, deja_impaye: 1,
    a_caution: 0, capacite_caution: 0, score_moralite: 0.2,
  });
  assert.equal(out.decision, DECISIONS.REJECT);
  assert.equal(out.risk_level, RISK_LEVELS.HIGH);
});

test('confidence approaches 1 for an extremely safe dossier, not a flat ~50%', () => {
  const out = scoreCreditApplication({
    application_id: 'extreme-safe', secteur: 'services', zone: 'urbain',
    montant_demande: 150000, duree_mois: 24,
    chiffre_affaires: 5000000, charges_activite: 500000, anciennete_activite_mois: 120,
    a_historique: 1, nb_credits_anterieurs: 5, nb_retards: 0, deja_impaye: 0,
    a_caution: 1, capacite_caution: 1, score_moralite: 1,
  });
  assert.equal(out.risk_level, RISK_LEVELS.LOW);
  assert.ok(out.confidence > 0.9, `expected confidence > 0.9 for an extreme case, got ${out.confidence}`);
});

test('recommended_amount never exceeds ~115% of the requested amount', () => {
  const out = scoreCreditApplication({
    application_id: 'cap-1', secteur: 'services', montant_demande: 100000, duree_mois: 12,
    chiffre_affaires: 5000000, charges_activite: 500000, anciennete_activite_mois: 60,
  });
  assert.ok(out.recommended_amount <= 100000 * 1.15);
});

test('genre is not accepted as a scoring input (excluded per Prisca\'s guide)', () => {
  const withGenre = scoreCreditApplication({ application_id: 'g1', secteur: 'commerce_detail', montant_demande: 300000, duree_mois: 12, chiffre_affaires: 500000, charges_activite: 200000, genre: 'F' });
  const withoutGenre = scoreCreditApplication({ application_id: 'g2', secteur: 'commerce_detail', montant_demande: 300000, duree_mois: 12, chiffre_affaires: 500000, charges_activite: 200000 });
  assert.equal(withGenre.score, withoutGenre.score, 'passing genre must not change the score');
});

test('on the 40-sample sheet, average score is meaningfully lower for dossiers that actually defaulted', () => {
  const rows = loadSampleRows();
  assert.ok(rows.length >= 30, `expected the sample sheet to have rows, got ${rows.length}`);

  const scores = { defaulted: [], clean: [] };
  rows.forEach((row, i) => {
    const out = scoreCreditApplication(rowToInput(row, `sample-${i}`));
    (row.defaut === '1' ? scores.defaulted : scores.clean).push(out.score);
  });

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgDefaulted = avg(scores.defaulted);
  const avgClean = avg(scores.clean);
  assert.ok(scores.defaulted.length > 0 && scores.clean.length > 0, 'sample sheet should contain both outcomes');
  assert.ok(avgClean > avgDefaulted, `expected clean-repayment dossiers to score higher on average (clean=${avgClean.toFixed(1)}, defaulted=${avgDefaulted.toFixed(1)})`);
});
