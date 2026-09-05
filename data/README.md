# Données — Scoring Microcrédit (synthétiques)

Fournies par Prisca (expertise métier crédit/microfinance de l'équipe).
**100% fictives**, générées uniquement pour entraîner et tester le moteur de
scoring — aucun client réel, aucune donnée personnelle.

- `donnees_completes.csv` — 3000 dossiers, la base d'entraînement (`ml/train_model.py`).
- `echantillon_40.csv` — 40 dossiers, un extrait relu ligne à ligne par Prisca ;
  sert aussi de fixture de test (`scoring/scoreCreditApplication.test.mjs`).
- `lexique.csv` — dictionnaire des colonnes.

## Points métier importants (validés par Prisca)

- **`genre` n'est pas une variable du score.** Il n'est utilisé que pour
  l'audit d'équité (cf. `ml/METRICS.md`) — jamais transmis au moteur de
  scoring (`scoring/scoreCreditApplication.mjs` ne l'accepte même pas en entrée).
- `revenu_activite` = **bénéfice** = `chiffre_affaires` − `charges_activite`
  (achats et dépenses d'exploitation), pas le chiffre d'affaires brut.
- Financement possible seulement à partir de 6 mois d'ancienneté d'activité
  (`anciennete_activite_mois >= 6`).
- `montant_demande` va de 150 000 à plusieurs centaines de millions de FCFA
  (échelle réelle BAOBAB, pas des petits montants).
- `defaut` (la cible) = 1 si impayé **ou** retards graves, 0 si remboursé
  correctement (~13% de défauts sur les 3000 dossiers) ; distinct de
  `type_probleme` (aucun / retards / impaye) qui détaille la nature du problème.
- Colonnes calculées automatiquement (déjà dans le fichier, et recalculées à
  l'identique par le moteur de scoring si absentes de l'entrée) :
  `mensualite = montant_demande / duree_mois`,
  `taux_endettement = mensualite / revenu_activite`,
  `couverture_cashflow = flux_tresorerie_net / mensualite`.

## Points encore à confirmer avec Prisca

- Niveau des achats par secteur (actuellement ≈ 80-90% du CA en commerce).
- Seuil exact des « retards graves » qui fait basculer un dossier en défaut.

Voir `lexique.csv` pour le détail colonne par colonne, et `ml/METRICS.md`
pour la performance du modèle entraîné sur ces données.
