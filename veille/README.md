# Veille employeur/activité

Implémente la spécification du rapport "Veille et corpus multiformat" (sept.
2026, transmis pour les 24 dernières heures). Recherche des événements
pouvant fragiliser les revenus d'un client (retard de salaire, fermeture,
perte de contrat) chez son employeur déclaré ou, à défaut, sur son
activité/secteur (cas de l'indépendant).

## Connecteur synthétique (implémenté en premier, comme demandé par le rapport)

`syntheticFeed.mjs` est un corpus **explicitement fictif** de publications
(aucune entreprise réelle) — même principe que `rag/corpus.mjs`
(`politique-credit-fictive`). C'est ce que le rapport appelle "le connecteur
synthétique", à implémenter avant tout connecteur réel.

## Rapprochement (matchEntity.mjs)

Règle stricte du rapport : *"Comparer nom, localisation et identifiants. Une
simple ressemblance de nom ne suffit pas."* Un nom seul, sans corroboration
par le secteur ou la localité, est classé `nom_seul_homonyme_possible` —
jamais un rapprochement confirmé. Le dédoublonnage par empreinte
(`dedupeByFingerprint`) empêche qu'une republication du même fait ne compte
comme une confirmation indépendante supplémentaire.

## Ce qui N'EST PAS fait (assumé, cf. rapport "Hors périmètre")

- **Aucun vrai connecteur web** (GDELT ou autre) n'est branché. Le rapport
  cite GDELT comme piste pour un connecteur réel futur
  (https://www.gdeltproject.org, API de recherche documentaire) — sa
  couverture des entreprises visées reste à vérifier, et ce n'est pas une
  dépendance du MVP synthétique. Si un vrai connecteur doit être ajouté un
  jour, il doit respecter la même interface que `matchEntityEvents` (entrée :
  nom/secteur/zone, sortie : liste d'événements avec source et date) pour
  rester interchangeable avec le flux synthétique — **jamais activé
  automatiquement** (pas d'appel réseau ni de service payant sans décision
  explicite de l'équipe).
- Aucune prédiction de faillite, aucune surveillance exhaustive du web,
  aucune décision automatique de refus à partir d'un article — le score
  principal n'est jamais modifié automatiquement par une alerte.
- Pas de tâche périodique automatique (cron) — déclenchement manuel
  uniquement ("Lancer la veille" dans l'interface), conforme à l'arbitrage
  du rapport ("remplacer un ordonnanceur complexe par... un déclenchement
  manuel démontrable").
