// Schéma SQLite — reprend telle quelle la proposition de Lory (Plan d'architecture
// & directives Jour J, section 5), avec un seul ajout additif et rétrocompatible :
// `credit_applications.extra_json`, qui porte les signaux qualitatifs optionnels
// (historique de crédit, réputation, contexte du secteur...) consommés par le
// contrat de scoring (@scoring/scoreCreditApplication) sans toucher aux colonnes
// d'origine. À valider avec Lory — c'est une extension, pas un changement
// d'architecture.
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
  amount_requested REAL NOT NULL,
  duration INTEGER NOT NULL,
  purpose TEXT,
  income REAL NOT NULL,
  expenses REAL NOT NULL,
  business_age INTEGER NOT NULL,
  savings INTEGER NOT NULL DEFAULT 0,
  guarantee INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT,
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
