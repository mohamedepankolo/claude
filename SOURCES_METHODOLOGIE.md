# Sources de la méthodologie du jeu de données synthétique

Question posée par l'équipe : au-delà des échanges avec nos experts métier
(Prisca pour le crédit/microfinance), sur quoi nous sommes-nous appuyés pour
choisir les paramètres du jeu de données synthétique (`data/`) ? Ce document
répond avec des sources externes vérifiables — 14 au total, largement audessus
du minimum de 10 demandé — chacune reliée explicitement au(x) paramètre(s)
qu'elle éclaire. Toutes vérifiées le 6 septembre 2026 (dates/URLs ci-dessous).

**Principe assumé** (cf. `data/README.md`, `ANALYSE_ARCHITECTURE_LORY_REV2.md`) :
un jeu de données synthétique n'a pas vocation à *reproduire* une source
réelle ligne à ligne — il doit être *plausible et défendable*, chaque
paramètre pouvant être justifié par au moins un repère externe documenté.
Là où deux sources donnent des chiffres différents (ex. emploi informel :
93,5% national vs 52,8% dans le fichier de Prisca), on le dit explicitement
plutôt que de trancher arbitrairement — cf. tableau de synthèse ci-dessous.

## Tableau de synthèse

| Paramètre | Valeur retenue | Statut | Sources principales |
|---|---|---|---|
| Plafond TEG (taux d'usure) | 24% | **Confirmé, réel** | 1, 2, 3 |
| Taux de `defaut` | 12,8% (fichier Prisca) / 14,1-14,3% (25 000 lignes) | Dans une fourchette réaliste documentée | 5, 6 |
| `genre` (part de femmes) | 55,3% (Prisca) / 62% (25 000 lignes) | Compromis documenté | 10 |
| `informel` | 52,8% (Prisca) / 68% (25 000 lignes) | Compromis documenté | 8 |
| `participe_tontine` / `epargne_mensuelle` | ~53% participent à une tontine, ~15% n'épargnent pas du tout | Cohérent avec l'ordre de grandeur national | 9 |
| `taux_endettement` comme variable dominante | Coefficient le plus élevé du modèle | Cohérent avec la pratique du secteur | 6, 12 |
| Échelle de `montant_demande` (jusqu'à centaines de millions FCFA) | Échelle SME/BAOBAB, pas du micro-ticket | Cohérent par contraste | 11 |
| Structure générale des colonnes (ratios + catégorielles + historique) | — | Cohérent avec la pratique du credit scoring | 13, 14 |

## 1. Cadre réglementaire — taux d'usure (TEG)

**1. BCEAO — "Taux d'usure pour les opérations de crédit des SFD dans la zone UMOA"**
Banque Centrale des États de l'Afrique de l'Ouest, page officielle.
https://www.bceao.int/fr/documents/taux-dusure-pour-les-operations-de-credit-des-sfd-dans-la-zone-umoa
→ Justifie directement `DEFAULT_TAUX_USURE = 0.24` dans
`regulatory/computeTEG.mjs` : ce n'est plus un placeholder, c'est le taux
réellement en vigueur pour les institutions de microfinance (SFD) dans
l'espace UMOA.

**2. Agence Ecofin — "UMOA : le taux de l'usure pour les institutions de microfinance passe à 24% en juin"** (2026)
https://www.agenceecofin.com/actualites-finance/3004-138022-umoa-le-taux-de-l-usure-pour-les-institutions-de-microfinance-passe-a-24-en-juin
→ Confirme la date d'entrée en vigueur (1er juin 2026) et la baisse depuis
27%. Recoupe la source 1 avec une source secondaire indépendante.

**3. Financial Afrik — "Taux d'usure dans l'UEMOA : le recalibrage opéré par la Décision n°19/29-12-2025/CM/UMOA"** (2026)
https://www.financialafrik.com/2026/07/27/taux-dusure-dans-luemoa-le-recalibrage-opere-par-la-decision-n19-29-12-2025-cm-umoa/
→ Identifie le texte réglementaire précis (décision du Conseil des Ministres
de l'UMOA, 31 décembre 2025) à l'origine du changement — permet de citer la
décision par son numéro sans en recopier le texte intégral (cf. principe
"jamais de contenu juridique fabriqué", `rag/corpus.mjs`).

## 2. Échelle et santé du secteur de la microfinance au Burkina Faso

**4. BCEAO — "Situation de la microfinance dans l'UMOA au 31 mars 2024"** (juillet 2024, PDF officiel)
https://www.bceao.int/sites/default/files/2024-07/Situation-de-la-microfinance-a-fin-mars-2024.pdf
→ Contexte sectoriel officiel (échelle du secteur SFD dans l'UMOA) utilisé
pour cadrer la présentation du projet devant les mentors.

**5. APSFD-BF (Association Professionnelle des Systèmes Financiers Décentralisés du Burkina Faso) — Analyse du secteur pour 2024** (relayée par Horonya Finance et leFaso.net)
https://horonyafinance.com/2024/07/01/analyse-du-secteur-de-la-microfinance-au-burkina-faso-pour-le-premier-trimestre-2024-etat-des-lieux-performances-financieres-et-perspectives/ ;
https://lefaso.net/spip.php?article137032=
→ Chiffres clés 2024 : encours de crédit 402,22 milliards FCFA (+7,77% vs
2023), 124 SFD actifs regroupant 1 800 662 membres, **taux de créances en
souffrance (NPL) de 7,40%** (contre 6,16% en 2023). C'est le repère le plus
proche et le plus récent pour notre secteur et notre pays. Note honnête :
le NPL est une mesure de portefeuille à un instant T, différente de notre
`defaut` (a déjà eu un impayé ou un retard grave sur la durée du crédit) —
les deux mesures ne sont pas strictement comparables, ce qui explique
pourquoi notre taux (~13-14%) est plus élevé sans être incohérent.

## 3. Risque de portefeuille en microfinance (Afrique subsaharienne)

**6. CGAP & MIX (Microfinance Information Exchange) — "Sub-Saharan Africa Microfinance Analysis and Benchmarking Report"** (2010/2011, version française)
https://www.cgap.org/sites/default/files/researches/documents/CGAP-MIX-Sub-Saharan-Africa-Microfinance-Analysis-and-Benchmarking-Report-2010-Apr-2011-French.pdf
→ Établit que le PAR30 (portefeuille à risque à 30 jours) oscille entre 8%
et 20% en Afrique subsaharienne selon les pays, bien au-dessus du seuil de
vigilance international (5%) et du seuil réglementaire UEMOA (PAR30 5%,
PAR90 3%). Notre taux de `defaut` (12,8-14,3%) se situe dans cette
fourchette documentée, ni optimiste ni exagérément pessimiste.

**7. CGAP — "Microfinance Over-Indebtedness" / "Is Microcredit Over-Indebtedness a Worldwide Problem?"** (blog CGAP, consulté 2026)
https://www.cgap.org/blog/microfinance-over-indebtedness ;
https://www.cgap.org/blog/is-microcredit-over-indebtedness-worldwide-problem
→ Justifie la logique métier du garde-fou "endettement externe déclaré"
(P0.1, `scoring/applyBusinessGuardrails.mjs`) : le sur-endettement croisé
entre institutions est un risque documenté à l'échelle du secteur, pas une
hypothèse arbitraire de l'équipe.

## 4. Emploi informel et inclusion financière (Burkina Faso)

**8. INSD (Institut National de la Statistique et de la Démographie, Burkina Faso) — Enquête Nationale de Base sur l'Emploi et le Secteur Informel (ENB-ESI, 2023)** et Enquête Régionale Intégrée sur l'Emploi et le Secteur Informel (ERI-ESI, 2018)
https://www.insd.bf/sites/default/files/2024-03/Note_Synth%C3%A9tique_emploi_secteurInformel.pdf ;
https://www.insd.bf/sites/default/files/2021-12/Burkina%20%20%20%20Faso_ERI-ESI_SyntheseVF.pdf
→ 93,5% de l'emploi est informel au Burkina Faso (chiffre national, tous
travailleurs confondus, y compris salariés du secteur formel). Notre
paramètre `informel` (52,8% dans le fichier de Prisca) est nettement en
dessous : nous documentons l'écart plutôt que de le corriger aveuglément
(un porteur de dossier qui atteint une institution de microfinance a par
construction une visibilité économique minimale, donc probablement moins
informel que la moyenne nationale). Le jeu à 25 000 lignes relève ce
paramètre à 68%, un compromis documenté entre les deux repères.

**9. Secrétariat Technique pour la Promotion de l'Inclusion Financière (Burkina Faso) — "Rapport 2021 sur l'inclusion financière au Burkina Faso"**, et enquête FinScope Burkina Faso (2016, relayée par Financial Afrik)
https://www.finances.gov.bf/fileadmin/user_upload/1_Rapport_2021_sur_l_inclusion_financiere_au_Burkina_Faso.pdf ;
https://www.financialafrik.com/2017/04/19/burkina-faso-les-revelations-de-lenquete-finscope-sur-linclusion-financiere/
→ 49% des Burkinabè n'épargnent pas du tout, 21% n'utilisent que des
mécanismes informels (tontines). Éclaire nos paramètres `epargne_mensuelle`
(15% de rangées à zéro dans notre générateur) et `participe_tontine`/
`regularite_tontine` — du même ordre de grandeur, sans prétendre à une
correspondance exacte (l'enquête porte sur la population générale, notre
jeu sur des porteurs de dossier de crédit).

**10. World Bank — Global Findex Database** (éditions 2017, 2021, 2025 ; Burkina Faso inclus)
https://www.worldbank.org/en/publication/globalfindex ;
https://microdata.worldbank.org/index.php/catalog/7878
→ Référence internationale standard sur l'épargne, l'emprunt et les
paiements informels — cadre de comparaison pour la partie "comportement
financier" du dossier (épargne, tontine), au-delà du seul cas burkinabè.

## 5. Genre et microfinance

**11. FinDev Gateway — "Comment le microcrédit transforme la vie des femmes entrepreneuses en Afrique de l'Ouest"**, et Cairn.info — "L'effet de la croissance des institutions de microfinance sur le pourcentage de femmes emprunteuses" (2024)
https://www.findevgateway.org/fr/actualites/comment-le-microcredit-transforme-la-vie-des-femmes-entrepreneuses-en-afrique-de-louest ;
https://shs.cairn.info/revue-mondes-en-developpement-2024-4-page-69?lang=fr
→ Les femmes représentent en moyenne **65% de la clientèle des ONG de
microfinance en Afrique de l'Ouest** (70-75% au niveau mondial/africain
global). Justifie l'ajustement du paramètre `genre` dans le jeu à 25 000
lignes (55,3% → 62% de femmes) : un compromis documenté entre le fichier
d'origine et ce repère régional, sans prétendre égaler exactement 65% (nos
montants vont jusqu'à l'échelle SME, un segment probablement un peu moins
féminin que le microcrédit associatif très petit montant où le 65% est
mesuré). **Rappel important** : `genre` n'entre jamais dans le modèle de
scoring (audit d'équité uniquement, cf. `data/README.md`) — cet ajustement
n'a donc aucun impact sur le comportement du modèle en production.

## 6. Jeux de données ouverts de scoring crédit (repères de structure, pas de calibration directe Burkina Faso)

**12. Kiva — jeu de données "Data Science for Good: Kiva Crowdfunding"** (Kaggle)
https://www.kaggle.com/datasets/fkosmowski/kivadhsv1
→ 671 205 prêts réels de microcrédit, répartis en 15 secteurs et 87 pays.
Référence sur la structure d'un jeu de microcrédit réel (secteurs, montants,
pays) — utile en argumentaire même si l'échelle de nos montants
(`montant_demande`, jusqu'à plusieurs centaines de millions FCFA, échelle
BAOBAB/SME) est nettement supérieure à la médiane Kiva (prêts associatifs
de quelques dizaines à centaines de dollars) : nous le disons explicitement
plutôt que de laisser croire à une correspondance directe.

**13. Kaggle — "Home Credit Default Risk"** (compétition, 307 511 clients)
https://www.kaggle.com/c/home-credit-default-risk
→ Taux de défaut réel observé ~8% sur un portefeuille de crédit à la
consommation. Notre taux (~13-14%, microcrédit non garanti sur un segment
plus risqué que le crédit à la consommation classique) est plus élevé mais
du même ordre de grandeur — cohérent avec le repère PAR30 8-20% (source 6).

**14. Kaggle — "Give Me Some Credit"** (250 000 emprunteurs) et UCI Machine Learning Repository — "Statlog (German Credit Data)" (1000 dossiers, licence CC BY 4.0)
https://www.kaggle.com/c/GiveMeSomeCredit ;
https://archive.ics.uci.edu/ml/datasets/statlog+(german+credit+data)
→ Deux jeux de référence académiques classiques en credit scoring. "Give Me
Some Credit" définit un ratio d'endettement (`debt ratio`) comme variable
prédictive centrale — cohérent avec notre choix de faire de
`taux_endettement` la variable la plus pondérée du modèle entraîné
(cf. `ml/model.json`, coefficient le plus élevé). "German Credit Data"
illustre le mélange de variables catégorielles (secteur, garantie,
historique) et de ratios financiers qui inspire la structure générale de
nos colonnes.

## Ce qui reste non sourcé (honnêteté assumée)

- Aucune source publique précise trouvée sur le **montant moyen de prêt par
  emprunteur** au Burkina Faso (l'agrégat APSFD-BF donne un encours total,
  pas un nombre d'emprunteurs actifs permettant de calculer une moyenne
  fiable) — notre échelle de `montant_demande` reste calée sur le
  positionnement produit de Baobab (mentionné dans `data/lexique.csv`
  depuis le début du projet), pas sur une moyenne sectorielle publiée.
- Les proportions de `secteur` (commerce_detail dominant, agriculture peu
  représentée) reflètent le fichier de Prisca, pas une source externe
  indépendante trouvée pour le Burkina Faso spécifiquement — un travail
  futur pourrait les recaler sur le recensement des activités du RGPH ou
  une enquête sectorielle de l'INSD si le temps le permet.
- Le calcul du taux de défaut avec le modèle réellement entraîné (cf.
  `data/README.md`) signifie que ce jeu de données ne peut pas servir de
  preuve indépendante que le modèle est bon — les sources 5 et 6 servent à
  vérifier que le taux obtenu est *plausible pour la région*, pas à
  valider le modèle lui-même (cf. `ml/METRICS.md` pour l'évaluation réelle
  du modèle : ROC-AUC, calibration, audit d'équité).
