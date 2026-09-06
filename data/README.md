# Données — Scoring Microcrédit (synthétiques)

Fournies par Prisca (expertise métier crédit/microfinance de l'équipe).
**100% fictives**, générées uniquement pour entraîner et tester le moteur de
scoring — aucun client réel, aucune donnée personnelle.

- `donnees_completes.csv` — 3000 dossiers, la base d'entraînement actuelle du
  modèle en production (`ml/train_model.py`, `ml/model.json`).
- `echantillon_40.csv` — 40 dossiers, un extrait relu ligne à ligne par Prisca ;
  sert aussi de fixture de test (`scoring/scoreCreditApplication.test.mjs`).
- `lexique.csv` — dictionnaire des colonnes (les 30 colonnes de Prisca + les
  colonnes d'extension et d'identité décrites ci-dessous).
- `donnees_completes_25000.csv` + `identites_fictives_25000.csv` — jeu de
  données élargi (25 000 dossiers), cf. section dédiée plus bas.

## Jeu de données élargi (25 000 dossiers)

Généré par `generate_dataset_25000.py` (exécuter depuis la racine du dépôt :
`python3 data/generate_dataset_25000.py`) à la demande de l'équipe, suite à
une remarque d'un expert mentor sur l'intérêt d'un plus gros volume. **Sur
les mêmes paramètres et la même logique** que le fichier de Prisca, mais
aussi **sourcé sur des références externes vérifiables** (au-delà des seuls
échanges avec nos experts métier) — cf. `SOURCES_METHODOLOGIE.md` à la
racine du dépôt, 14 sources (BCEAO, APSFD-BF, INSD, CGAP/MIX, Global
Findex, Kaggle/UCI...) explicitement reliées à chaque paramètre :

- Les mêmes 30 colonnes, mêmes noms, mêmes formules (`revenu_activite =
  chiffre_affaires - charges_activite`, etc.).
- Proportions et distributions calibrées sur celles mesurées directement
  sur `donnees_completes.csv` (secteur, historique, tontine...), à
  l'exception de `genre` et `informel`, ajustés vers des repères externes
  sourcés (respectivement 62% de femmes et 68% d'activité informelle,
  contre 55,3% et 52,8% dans le fichier de Prisca — compromis documentés
  dans `SOURCES_METHODOLOGIE.md`, sans impact sur le modèle entraîné
  puisque `genre` n'y entre jamais et que ce fichier n'est pas utilisé pour
  ré-entraîner le modèle en production).
- **La colonne `defaut` est calculée avec le modèle réellement entraîné**
  (`ml/model.json`, mêmes coefficients que `scoring/scoreCreditApplication.mjs`)
  plutôt qu'une règle réinventée — un dossier synthétique est étiqueté
  "défaut" avec exactement la même probabilité que ce que l'application
  calculerait pour lui aujourd'hui. Taux de défaut obtenu : ~14,3% (contre
  12,8% sur les 3000 dossiers d'origine — écart résiduel assumé et
  documenté dans les commentaires du script). Ce taux reste dans la
  fourchette de 8-20% documentée pour le PAR30 en Afrique subsaharienne
  (source CGAP/MIX, cf. `SOURCES_METHODOLOGIE.md`), même s'il est
  supérieur au taux de créances en souffrance national le plus récent
  (7,40% en 2024, source APSFD-BF) — les deux mesures ne sont pas
  strictement comparables (portefeuille à un instant T vs historique du
  dossier), différence documentée dans `SOURCES_METHODOLOGIE.md`.
- `montant_demande` est arrondi à des paliers ronds (25 000 à 1 000 000 FCFA
  selon l'échelle du montant) plutôt qu'un chiffre arbitraire — ex. 1 300 000
  ou 1 350 000, jamais 1 319 000.
- **Graine documentée** (`RANDOM_STATE = 20260906`), reproductible — à la
  différence du fichier d'origine de Prisca, dont la méthode de génération
  n'est pas connue (cf. "Points encore à confirmer" ci-dessous).

Colonnes d'extension ajoutées (absentes du fichier de Prisca, mais
réellement saisies dans le formulaire de l'application aujourd'hui —
garde-fous métier et veille employeur/activité) : `anciennete_membre_mois`,
`endettement_externe_declare`, `montant_dernier_credit`, `type_credit`,
`type_garantie`, `valeur_garantie`, `pertinence_saisonniere`,
`croissance_ventes_pct`, `employeur_nom`. Champs optionnels dans le vrai
formulaire → laissés vides ici avec un taux de renseignement réaliste
(jamais 100%), cf. `lexique.csv`.

**`identites_fictives_25000.csv`** donne à la démo la structure d'une vraie
base cliente (nom, prénom, sexe, date/lieu de naissance, numéro CNIB,
numéro de téléphone, date d'entretien), jointe à `donnees_completes_25000.csv`
par `dossier_id`. **100% fictif, aucune donnée réelle** : combinaisons
aléatoires de prénoms/noms de famille et de villes courants au Burkina Faso
(aucun lien avec une personne réelle, comme n'importe quel jeu de test
"Jean Dupont"), numéro CNIB de format illustratif (pas le schéma officiel
réel), numéro de téléphone au format burkinabè mais tiré au hasard (même
principe que les numéros "555" factices). **Ce fichier n'est jamais utilisé
pour le scoring** — même principe que `genre`, déjà exclu du modèle : une
identité n'entre jamais dans les variables d'entraînement.

**Décision volontairement laissée à l'équipe : ré-entraîner ou non le
modèle en production sur ce fichier.** `donnees_completes_25000.csv` est
prêt à être utilisé (`python3 ml/train_model.py` en changeant `DATA_PATH`),
mais le faire changerait les coefficients du modèle actuellement démontré
(`ml/model.json`) et donc les scores/décisions affichés dans la démo — pas
fait automatiquement pour ne pas modifier le comportement de l'application
sans validation explicite avant une démonstration.

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
