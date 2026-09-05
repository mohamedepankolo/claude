// Schéma SQLite — reprend la structure de Lory (Plan d'architecture & directives
// Jour J, section 5) : clients / credit_applications / credit_scores /
// credit_decisions / sync_queue. Les colonnes de credit_applications ont été
// mises à jour pour porter les variables réelles validées par Prisca sur le
// jeu de données synthétique (data/donnees_completes.csv), plutôt que les
// noms génériques (income/expenses/...) d'un premier brouillon — c'est ce
// dont le contrat de scoring (@scoring/scoreCreditApplication) a besoin.
// `genre` est stocké (utile pour l'audit d'équité) mais n'est jamais transmis
// au moteur de scoring.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_applications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  genre TEXT,
  age INTEGER,
  zone TEXT,
  secteur TEXT NOT NULL,
  informel INTEGER NOT NULL DEFAULT 0,
  personnes_a_charge INTEGER NOT NULL DEFAULT 0,
  anciennete_activite_mois INTEGER NOT NULL,
  chiffre_affaires REAL NOT NULL,
  charges_activite REAL NOT NULL,
  revenu_activite REAL,
  flux_tresorerie_net REAL,
  charges_perso REAL NOT NULL DEFAULT 0,
  montant_demande REAL NOT NULL,
  duree_mois INTEGER NOT NULL,
  epargne_mensuelle REAL NOT NULL DEFAULT 0,
  regularite_epargne REAL NOT NULL DEFAULT 0,
  participe_tontine INTEGER NOT NULL DEFAULT 0,
  regularite_tontine REAL NOT NULL DEFAULT 0,
  a_historique INTEGER NOT NULL DEFAULT 0,
  nb_credits_anterieurs INTEGER NOT NULL DEFAULT 0,
  nb_retards INTEGER NOT NULL DEFAULT 0,
  deja_impaye INTEGER NOT NULL DEFAULT 0,
  a_caution INTEGER NOT NULL DEFAULT 0,
  capacite_caution REAL NOT NULL DEFAULT 0,
  score_reputation REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS credit_scores (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  confidence REAL NOT NULL,
  recommended_amount REAL NOT NULL,
  explanations TEXT NOT NULL,
  narrative TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES credit_applications(id)
);

CREATE TABLE IF NOT EXISTS credit_decisions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES credit_applications(id)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
