# Baraka Score — architecture complète du risque de crédit (plan de travail détaillé)

Ce document répond à une demande explicite : donner une vue complète et
détaillée de tout le travail lié à **l'évaluation du risque de crédit**, en
intégrant les retours des 3 sessions de mentoring (`NOTES_MENTORING_CIF.md`),
et en **sortant volontairement le TEG de ce périmètre**.

**Pourquoi le TEG est retiré de ce plan** : la session 3 de Prisca l'affirme
sans ambiguïté — *"le taux est déjà prédéfini [...] le taux n'a rien à voir
avec l'évaluation du risque"*. Le TEG (`regulatory/computeTEG.mjs`) reste un
moteur complet, stable et testé, mais c'est un calcul de **conformité
réglementaire** sur un taux fixé par la politique de l'institution — pas un
facteur de risque, et pas un sujet qui doit polluer l'architecture du
scoring. Il continue à vivre séparément, affiché séparément dans l'app,
inchangé. Ce document ne le mentionne plus après cette section.

---

## 1. Où on en est (résumé, cf. `ARCHITECTURE.md` pour le détail technique)

| Brique | État |
|---|---|
| Risk Scoring Engine (régression logistique entraînée) | ✅ `scoring/scoreCreditApplication.mjs` |
| Affordability (montant soutenable) | ✅ intégré au contrat de scoring (`recommended_amount`) |
| Profitability/Viability Engine (marge de l'institution) | ✅ `finance/computeViability.mjs` |
| RAG documentaire | ✅ `rag/` |
| LLM local (explication, chat) | ✅ `llm/`, avec repli déterministe |
| App React + IndexedDB (Dexie) | ✅ `app/` |
| ~~TEG~~ | (hors périmètre de ce document, cf. ci-dessus) |

Les 3 moteurs pertinents pour le risque sont construits et testés. Ce qui
suit est un **audit complet du référentiel métier de Prisca** face à ce
qu'on modélise réellement aujourd'hui, pour prioriser ce qui reste.

⚠️ **Piège de vocabulaire à noter** : le mot "rentabilité" est utilisé pour
**deux choses différentes** dans ce projet, à ne jamais confondre :
- la **rentabilité de l'activité du client** (marge de son commerce/atelier —
  c'est un facteur d'entrée du risque, déjà couvert par `revenu_activite` =
  `chiffre_affaires − charges_activite` dans le contrat de scoring) ;
- la **rentabilité du crédit pour l'institution** (marge de la CIF sur ce
  prêt précis — c'est `finance/computeViability.mjs`, un calcul de sortie,
  après décision, jamais un facteur d'entrée du score).
La session 3 parle des deux dans le même souffle (l'exemple du bidon d'eau à
500/1000 FCFA illustre la première) — bien les garder distinctes en démo.

---

## 2. Le référentiel complet du risque (issu des 3 sessions de mentoring)

Pour chaque catégorie du référentiel de Prisca : ce qu'on couvre déjà, ce
qui manque, et si le manque est comblable avec les données actuelles ou non.

### 2.1 Données personnelles du membre
**Couvert** : `age`, `zone` (urbain/rural), `secteur`, `personnes_a_charge`,
`informel`. **Non couvert et non prioritaire** : résidence précise,
profession déclarée hors secteur d'activité — informations de contexte, pas
des variables de risque discriminantes à ce stade (cf. discipline de scope,
session 2 : *"votre solution doit être de pouvoir faire le scoring
seulement"*). **Aucune action recommandée ici.**

### 2.2 Activité et capacité de remboursement
| Sous-élément | État | Variable actuelle |
|---|---|---|
| Produit vendu, clientèle, fournisseur | Non modélisé | — (qualitatif, secteur sert de proxy) |
| Croissance des ventes | Non modélisé | — (nécessite un historique de CA, pas juste un CA instantané) |
| Secteur porteur (perspective 5 ans) | Partiellement | `secteur` (catégoriel, pas de score de "porteur") |
| **Pertinence saisonnière des besoins** | Non modélisé | — (nécessite date de demande + calendrier sectoriel) |
| **Rentabilité de l'activité du client** | ✅ Couvert | `revenu_activite`, `chiffre_affaires`, `charges_activite` |

### 2.3 Situation financière
| Sous-élément | État | Variable actuelle |
|---|---|---|
| Flux de trésorerie (moyenne vs traite) | Partiellement | `flux_tresorerie_net`, `epargne_mensuelle`, `regularite_epargne` — pas un vrai relevé de mouvements de compte |
| Niveau d'endettement externe (autres institutions) | **Non couvert (vide majeur)** | — |
| Bilan rapide (actif circulant vs dettes) | Non couvert | — (peu réaliste pour l'informel de toute façon) |

### 2.4 Historique de remboursement
| Sous-élément | État | Variable actuelle |
|---|---|---|
| Nombre de crédits, incidents de paiement | ✅ Couvert | `nb_credits_anterieurs`, `nb_retards`, `deja_impaye`, `a_historique` |
| **Progressivité du crédit** (montant demandé vs montants historiques) | **Non couvert (vide identifié comme fort par Prisca)** | on a le *nombre* de crédits antérieurs, jamais leurs *montants* |

### 2.5 Garanties
| Sous-élément | État | Variable actuelle |
|---|---|---|
| Présence + solidité générique | ✅ Couvert | `a_caution`, `capacite_caution` (0-1) |
| Type de garantie (foncier vs véhicule vs caution) | Non couvert | déjà noté en session 1 |
| **Ratio garantie/montant demandé** | Non couvert | — (on a `capacite_caution` en score 0-1, pas de valeur FCFA de la garantie) |
| Caractère réalisable | Non modélisable simplement | qualitatif, jugement de l'agent |

### 2.6 Ancienneté dans l'institution
**Non couvert du tout** : aucun champ `anciennete_membre_mois` distinct de
`anciennete_activite_mois` (qui mesure l'activité, pas la relation avec
l'institution). Vide simple à combler si le besoin est confirmé.

### 2.7 Spécificités par type de crédit
Le modèle actuel traite tous les dossiers avec le même jeu de variables,
différencié uniquement par `secteur`. Le référentiel de Prisca distingue en
plus des **critères propres au type de crédit** (salarié/domiciliation,
agricole/pluviométrie, BTP-marché public/maître d'ouvrage). **Non couvert**,
et structurellement plus gros que les autres écarts (cf. §4).

### 2.8 Dimension externe — BIC
**Non couvert, absent du dataset synthétique.** Couvre : endettement
multi-institutions, grands facturiers (ONEA/SONABEL), alerting, détection
multi-agences interne. Cf. `NOTES_MENTORING_CIF.md` session 3 pour le détail
du mécanisme. C'est le vide le plus "réel" (il existe en production chez la
CIF) mais aussi le plus hors de portée technique d'un prototype hackathon
(API externe payante, contrat BCEAO).

---

## 3. Ce qui est déjà solide (confirmé par les 3 sessions, ne pas retoucher)

- Cold-start (primo-demandeur) géré sur les autres critères disponibles.
- `recommended_amount` : le montant soutenable prime sur le montant demandé.
- `genre` exclu du scoring, audité a posteriori seulement.
- Le score ne dépend jamais du secteur seul de façon disproportionnée —
  modèle général sur le corpus complet, spécialisation par secteur reportée
  (cohérent avec le conseil du mentor, session 1).
- **Le taux n'est jamais un input ni un output du scoring** (confirmé ici
  explicitement, cf. l'intro de ce document).

---

## 4. Travail restant, priorisé

### P0 — faisable maintenant, sans nouvelles données d'entraînement

Ces trois points ont un point commun essentiel : ils ne demandent **pas de
réentraîner le modèle** (ce qui exigerait des milliers de dossiers
réels/synthétiques supplémentaires que nous n'avons pas). Ils s'implémentent
comme des **garde-fous métier** (business rules) appliqués **après** le
score ML, en plus de lui — jamais en le remplaçant, jamais en fabriquant un
résultat non justifié. C'est exactement le même principe déjà utilisé pour
le plafond de `recommended_amount` (jamais plus de ~115% du montant demandé).

1. **Endettement externe déclaré** — un champ simple dans le formulaire
   (montant total déclaré par l'agent après une vérification, même
   manuelle/orale en l'absence d'API BIC réelle). Règle proposée : si ce
   montant dépasse un seuil (p. ex. le double de `revenu_activite`), forcer
   `decision` à `review` au minimum, quel que soit le score ML, avec une
   explication dédiée ("endettement externe élevé — vérification
   recommandée"). Prépare aussi le terrain pour une vraie intégration BIC
   plus tard sans rien casser.
2. **Ancienneté dans l'institution** — champ `anciennete_membre_mois`. Règle
   proposée : pour un nouveau membre (< 6 mois d'ancienneté institution,
   distinct de l'ancienneté d'activité), plafonner `recommended_amount` plus
   bas (p. ex. 70% du plafond habituel) — cohérent avec le principe de
   progressivité déjà énoncé par Prisca pour les crédits eux-mêmes.
3. **Progressivité du crédit** — ajouter le(s) montant(s) des crédits
   antérieurs (au minimum : montant du dernier crédit soldé). Règle
   proposée : si `montant_demande` dépasse un multiple du dernier montant
   emprunté (p. ex. ×3), forcer `review` et l'expliquer explicitement
   ("montant demandé disproportionné par rapport à l'historique du
   membre") — reprend directement l'exemple CP1→CM2 de Prisca.

**Livrable technique proposé** : un nouveau module pur et testé,
`scoring/applyBusinessGuardrails.mjs`, qui prend en entrée le résultat de
`scoreCreditApplication` + ces 3 champs additionnels, et retourne le même
contrat de sortie (`decision`, `recommended_amount`, `explanations`)
éventuellement durci, jamais assoupli. Reste séparé du modèle ML entraîné —
donc explicable, déterministe, et modifiable sans réentraînement si les
seuils doivent changer.

### P1 — nécessite discussion/validation avec Prisca avant d'être codé

- **Type de crédit différencié** (salarié / agricole / commerce / BTP) avec
  des critères et des durées propres à chacun — gros chantier : implique un
  nouveau champ `type_credit`, potentiellement des sous-formulaires
  spécifiques, et une logique de branchement dans le scoring ou en garde-fou
  additionnel. À ne pas sous-estimer en taille.
- **Pertinence saisonnière** — nécessite une date de demande + un calendrier
  de "pics" par secteur (donnée qui n'existe nulle part actuellement, à
  construire avec Prisca si jugé prioritaire).
- **Croissance des ventes** — nécessite un historique de CA sur plusieurs
  mois, pas juste un instantané ; à voir si les vrais dossiers CIF
  contiennent déjà cette série ou s'il faut la demander en plus.
- **Type de garantie + ratio garantie/montant** — remplacer `capacite_caution`
  (0-1 générique) par un couple (type, valeur FCFA) : amélioration réelle
  déjà notée en session 1, non codée faute de variable dans le dataset actuel.

### P2 — documenté, mais hors de portée du prototype hackathon

- **Intégration BIC réelle** (API BCEAO, format XML, coût par requête) —
  infrastructure externe, contrat institutionnel, largement hors cadre.
- **Détection multi-agences interne** — suppose un backend partagé
  (Firestore réel) au lieu d'IndexedDB local par navigateur ; à noter dans
  `ARCHITECTURE.md` comme un prérequis pour cette fonctionnalité, pas une
  tâche de scoring.
- **Bilan rapide (actif circulant vs dettes)** — peu réaliste pour la
  majorité informelle du portefeuille CIF ; à réserver aux dossiers
  d'entreprises formalisées si un jour distingués.
- **Alerting BIC** — encore en pilote côté BIC lui-même, rien à construire
  de notre côté avant que ça existe en production chez eux.

---

## 5. État d'implémentation — P0, P1 et P2 construits ✅

Décision de l'équipe (Mohamede) : construire les trois paliers plutôt que
s'arrêter au P0, en assumant honnêtement les limites du P2 (pas de vraie
intégration BIC). Tout est dans `scoring/applyBusinessGuardrails.mjs`
(module pur, 17 tests, `scoring/applyBusinessGuardrails.test.mjs`), appliqué
**après** `scoreCreditApplication` — jamais à sa place, jamais en modifiant
`explanations`/`score`/`confidence`/`risk_level` du modèle entraîné.
Principe strict : une règle ne peut que **durcir** `decision` (jamais
approve← review/reject) et/ou **réduire** `recommended_amount` (jamais
l'augmenter).

- **P0 — construit** : endettement externe déclaré (`endettement_externe_declare`),
  ancienneté du membre dans l'institution (`anciennete_membre_mois`, plafonne
  le montant si < 6 mois), progressivité du crédit (`montant_dernier_credit`,
  réescalade + replafonne si le montant demandé dépasse 3x le dernier crédit).
- **P1 — construit** : cohérence durée/`type_credit` (informatif, jamais
  bloquant — `DUREE_NORMES_PAR_TYPE`), ratio garantie/montant
  (`type_garantie` + `valeur_garantie`, seuil 50%), pertinence saisonnière et
  croissance des ventes — **toutes deux déclarées par l'agent** (champs
  qualitatifs collectés à l'entretien terrain, jamais déduites d'une donnée
  qu'on n'a pas — cf. principe "ne jamais fabriquer un résultat").
- **P2 — construit, avec une limite assumée** : `hasOtherApplicationForClient`
  détecte un doublon de dossier **dans la base IndexedDB locale de ce
  navigateur** — un vrai proxy honnête, pas une consultation BIC réelle ni
  une détection multi-agences (qui suppose un backend partagé/Firestore,
  toujours absent). Le panneau `ExternalChecksPanel.jsx` opérationnalise la
  recommandation de Prisca d'archiver chaque vérification d'endettement
  externe (rapport BIC ou vérification manuelle) dans une "bibliothèque"
  interne (`viability`-like table `external_credit_checks`) — sans jamais
  prétendre interroger le BIC lui-même.

**Ce qui reste explicitement hors de portée**, à dire tel quel en
soutenance : la vraie API BIC (contrat BCEAO, coût par requête), la
détection multi-agences réelle (backend partagé), le bilan comptable complet
(peu réaliste sur l'informel), et la différenciation fine des critères par
type de crédit au-delà de la norme de durée (ex. logique agricole
pluviométrie/site d'exploitation) — documentés ici plutôt que fabriqués.

## 6. TEG — repositionné en fin de flux, toujours séparé du risque

Suite à la confirmation de Prisca ("le taux n'a rien à voir avec
l'évaluation du risque"), `RegulatoryPanel` (TEG) est déplacé en **dernière
position** parmi les panneaux de décision dans `App.jsx` : Résultat (score +
garde-fous) → Vérifications externes → Rentabilité (institution) → **TEG**
→ Assistant réglementaire (RAG) → Chat. Le calcul lui-même
(`regulatory/computeTEG.mjs`) est inchangé — seul l'ordre d'affichage
change, pour refléter que la conformité réglementaire est vérifiée une fois
la décision de risque prise, jamais un facteur d'entrée de cette décision.
