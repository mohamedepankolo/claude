/**
 * Baraka Score — flux synthétique de veille (employeurs/activités)
 *
 * Corpus contrôlé et explicitement FICTIF (cf. rapport "Veille et corpus
 * multiformat", section 7 : "entreprises, clients, pièces et publications
 * simulés, marqués explicitement. Ne pas fabriquer de fausses nouvelles
 * attribuées à une entreprise réelle") — même principe que
 * `rag/corpus.mjs` (`politique-credit-fictive`). Aucun nom ci-dessous ne
 * doit ressembler à une entreprise réelle du Burkina Faso ou d'ailleurs.
 *
 * Représente ce que le rapport appelle "le connecteur synthétique" (§6) :
 * implémenté en premier, avant tout connecteur réel (GDELT ou autre),
 * jamais activé automatiquement — cf. `veille/README.md` pour la marche à
 * suivre si un vrai connecteur doit être branché plus tard.
 */

export const SYNTHETIC_FEED = [
  {
    id: 'pub-001',
    entite_nom: 'Comptoir Fictif du Sahel',
    entite_secteur: 'commerce_detail',
    entite_localite: 'Ouagadougou',
    type: 'retard_salarial',
    date_evenement: '2026-07-15',
    date_publication: '2026-07-20',
    extrait: "Plusieurs employés du Comptoir Fictif du Sahel signalent un retard de paiement de salaire de deux mois, attribué par la direction à des difficultés de trésorerie temporaires.",
    source_titre: 'Bulletin économique fictif — édition de démonstration',
    empreinte: 'demo-pub-001-v1',
  },
  {
    id: 'pub-002',
    entite_nom: 'Comptoir Fictif du Sahel',
    entite_secteur: 'commerce_detail',
    entite_localite: 'Ouagadougou',
    type: 'fermeture',
    date_evenement: '2026-08-02',
    date_publication: '2026-08-05',
    extrait: 'Le Comptoir Fictif du Sahel a fermé son point de vente principal à Ouagadougou. Les modalités de reclassement du personnel ne sont pas précisées.',
    source_titre: 'Bulletin économique fictif — édition de démonstration',
    empreinte: 'demo-pub-002-v1',
  },
  {
    id: 'pub-003',
    entite_nom: 'Atelier Fictif Bobo Artisans',
    entite_secteur: 'artisanat',
    entite_localite: 'Bobo-Dioulasso',
    type: 'perte_contrat',
    date_evenement: '2026-06-10',
    date_publication: '2026-06-12',
    extrait: "L'Atelier Fictif Bobo Artisans annonce la perte d'un contrat de fourniture majeur, sans précision sur l'impact attendu sur l'emploi.",
    source_titre: 'Communiqué fictif — édition de démonstration',
    empreinte: 'demo-pub-003-v1',
  },
  {
    id: 'pub-004',
    entite_nom: 'Comptoir Fictif du Sahel',
    entite_secteur: 'commerce_detail',
    entite_localite: 'Ouagadougou',
    // Republication du même événement que pub-001 par une autre source —
    // sert à tester le dédoublonnage : même empreinte logique, ne doit
    // jamais compter comme une confirmation indépendante supplémentaire.
    type: 'retard_salarial',
    date_evenement: '2026-07-15',
    date_publication: '2026-07-22',
    extrait: 'Reprise du signalement de retards de paiement de salaire au Comptoir Fictif du Sahel, déjà publié le 20 juillet.',
    source_titre: 'Reprise fictive — édition de démonstration',
    empreinte: 'demo-pub-001-v1',
  },
]
