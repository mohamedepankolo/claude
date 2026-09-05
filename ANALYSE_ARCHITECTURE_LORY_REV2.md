# Analyse — "Architecture, Business Model et MVP" de Lory, Révision 2 (sept. 2026)

Ce document de Lory est **le document de cadrage officiel actuel** — il
remplace explicitement "le planning de plusieurs semaines, le modèle
commercial d'abonnement porté par l'équipe et les pourcentages de confiance
non définis" (page 2). Ce qui suit compare, section par section, ce qu'il
exige à ce qu'on a réellement construit — pour confirmer ce qui est aligné,
et surtout **isoler les points où ce document contredit une décision qu'on a
prise ce même jour**, avant de continuer à coder dans une direction qui
irait à l'encontre du cadrage officiel.

## ⚠️ Deux points à trancher avant de continuer (pas une simple note)

### 1. Conflit direct : le TEG doit-il rester affiché ?

Le document de Lory est sans ambiguïté :
- Section 2 (parcours de l'agent), étape 5 "Offre" : *"Simuler montant,
  durée, échéances et TEG pour le produit retenu dans la démonstration."*
- Section 7 : *"Le TEG constitue un résultat financier distinct du score
  principal"* — confirme notre séparation TEG/score, mais confirme aussi
  que le TEG doit exister et être visible.
- Section 12 (démonstration), ligne "Simulation" : *"Montant, durée,
  échéance et TEG du cas de référence"* est une **preuve attendue** par le
  jury, explicitement listée dans le tableau de démonstration.
- Section 11, priorité 2 en cas de retard : *"cas de TEG maîtrisé"*.

**Or, plus tôt aujourd'hui, tu m'as explicitement demandé de retirer le
panneau TEG ("simuler le crédit") de l'affichage.** Le moteur
(`regulatory/computeTEG.mjs`) et le composant (`RegulatoryPanel.jsx`) sont
restés en place, juste non montés dans `App.jsx` — donc c'est réversible en
une ligne, mais **en l'état actuel, le parcours ne montre plus une preuve
que le cadrage de Lory liste explicitement comme attendue par le jury.**

Je n'ai rien réactivé sans te le demander — mais il faut trancher :
faut-il remettre le panneau TEG dans l'affichage (au moins pour la démo),
ou y a-t-il une raison de le garder masqué que je ne connais pas (ex. un
autre écran/pitch le montre autrement) ?

### 2. Le champ "confiance" tel qu'il existe aujourd'hui semble être exactement ce que Lory demande de remplacer

Section 3 du document définit précisément 5 notions à afficher : **score
principal**, **probabilité de défaut**, son **complément** (1 − p, avec
l'avertissement explicite que "ce n'est pas automatiquement une garantie de
remboursement intégral"), **qualité du dossier** (complétude/cohérence,
calculée à partir de règles documentées — *"elle ne mesure pas la
probabilité que la prédiction soit correcte"*), et **fiabilité et limites**
(signaler données manquantes, cas atypiques, domaines non couverts —
*"aucun pourcentage global sans méthode justifiée"*).

**Notre champ `confidence` actuel** (`scoreCreditApplication.mjs`, 0-1,
affiché en %) ne correspond à AUCUNE de ces 5 notions : c'est une distance
au seuil de décision (calibrée à la main, pas évaluée statistiquement) —
exactement le genre de *"pourcentage de confiance non défini"* que la
phrase d'ouverture du document dit remplacer. C'est très probablement lié à
ta propre question de la session précédente ("c'est quoi la différence
entre le score et la confiance ?") : la réponse de Lory, dans ce document,
semble être *"ce pourcentage-là ne devrait pas exister sous cette forme"*.

**Je n'ai rien changé au contrat de scoring sans confirmation** — `score`,
`decision`, `explanations` restent le contrat stable utilisé partout dans
l'app. Mais voici ce que je propose concrètement, à valider :
- Retirer `confidence` de l'affichage (`ResultPanel.jsx`) — pas forcément du
  contrat de retour (peut rester en interne/debug).
- Ajouter une **"qualité du dossier"** : un score de complétude/cohérence
  calculé par des règles simples et documentées (ex. : proportion de champs
  renseignés parmi les champs attendus pour le secteur, cohérence des
  montants/dates) — indépendant du modèle ML, donc jamais confondu avec la
  probabilité de défaut.
- Ajouter une **"fiabilité et limites"** : liste des signaux qui limitent la
  confiance qu'on peut avoir dans le résultat (champ manquant complété par
  une valeur par défaut, secteur hors du corpus d'entraînement dominant,
  montant très atypique par rapport à la distribution d'entraînement) —
  affichée comme du texte factuel, jamais comme un pourcentage global.

Ça correspond très directement à un vrai vide qu'on n'a pas comblé (cf.
section suivante) : **le contrôle qualité du dossier avant scoring**.

## Ce que le document confirme (aucun changement nécessaire)

- Garder le code, les outils et les composants déjà construits, ne pas
  repartir d'une architecture nouvelle pendant les 48h (section 1) — c'est
  exactement l'approche suivie depuis le début de cette session.
- Le TEG reste un résultat séparé du score, jamais piloté par le LLM
  (section 7) — déjà notre principe strict.
- Aucun plafond réglementaire, aucune formule officielle, aucune liste de
  frais n'est fixée par ce document (section 7) — confirme que
  `DEFAULT_TAUX_USURE = 0.24` (placeholder documenté) est la bonne approche,
  à faire valider par le référent métier avant tout usage réel.
- Le RAG explique, ne calcule jamais le risque lui-même, cite sa source et
  sa version, indique la limite en l'absence de source suffisante
  (section 7) — exactement le comportement de `rag/retrieve.mjs` +
  `RegulatoryAssistant.jsx`.
- Firebase reste un moyen de démonstration, jamais une dépendance
  obligatoire de la cible institutionnelle (section 5) — confirme
  `mockRemoteAdapter` + synchronisation best-effort déjà en place.
- Ne jamais écraser silencieusement une donnée en cas de conflit de
  synchronisation (section 6) — cohérent avec le choix déjà fait d'ajouter
  une nouvelle ligne d'historique (`mostRecent()` dans `repository.js`)
  plutôt que d'écraser un score/une décision précédente.
- Aucun abonnement commercial, aucun revenu de licence présumé (section 8)
  — concerne le pitch/business model de l'équipe (Eugène), pas notre code.
- RAG = priorité 3, à réduire plutôt qu'à enrichir si le temps manque
  (section 11) — notre RAG est déjà fonctionnel et testé ; pas d'urgence à
  l'enrichir davantage, cohérent avec la priorisation de Lory.

## Vrais vides identifiés (rien construit actuellement)

### Contrôle qualité du dossier (étapes 2-3 du parcours agent, section 2)

Repérer les champs absents, les incohérences, les périodes incompatibles et
les pièces non vérifiées **avant** l'évaluation — et si des informations
manquent, **demander un complément explicite avec sa justification métier**
plutôt que de silencieusement les remplacer par une valeur par défaut.

Notre comportement actuel va à l'encontre de ce principe par endroits :
`scoreCreditApplication.mjs` remplace silencieusement `age` absent par 35,
`score_reputation` par 0.5, etc. (cf. `values = { age: input.age ?? 35, ... }`)
— pratique pour un prototype qui doit toujours produire un chiffre, mais
contraire à *"une donnée manquante reste identifiable"* (section 2) et à
l'esprit de l'abstention (section 3).

### Abstention (section 3)

Un état explicite, distinct de accorder/examiner/refuser, où le système
refuse de conclure et demande une revue humaine ou un complément — parce
que des informations critiques manquent, ou que le dossier sort du domaine
couvert par le modèle (ex. secteur jamais vu, montant hors échelle
d'entraînement). *"Un contrôle de qualité peut bloquer l'analyse, même si
le moteur serait techniquement capable de produire un nombre."*

### Les "trois situations à démontrer" (section 2) — statut actuel

1. **Dossier complet et profil favorable** ✅ — déjà démontrable (dossier-témoin 1 du `GUIDE_DEMO.md`).
2. **Dossier incomplet → complément ou abstention** ❌ — pas construit : aujourd'hui un dossier incomplet est simplement scoré avec des valeurs par défaut silencieuses, jamais une demande de complément ni une abstention.
3. **Dossier complet mais risqué** (qualité élevée + risque défavorable coexistent) ⚠️ — démontrable en théorie (dossier-témoin 3), mais sans indicateur de "qualité du dossier" séparé, la distinction qualité/risque n'est pas visuellement claire aujourd'hui.

## Statut à préparer pour Lory (section 14, explicitement demandé)

Le document dit noir sur blanc : *"Avancement technique : Projet déjà
engagé ; détail des composants terminés **non fourni**."* et demande une
*"fiche de suivi"* par composant (état, responsable, tâche restante,
blocage, preuve de fonctionnement), en commençant par *"le formulaire, le
moteur de risque, le générateur, le TEG, le RAG et la synchronisation"*.

Autrement dit : **Lory n'a pas connaissance de ce qui a déjà été construit**
(scoring entraîné et évalué, 4 moteurs métier, garde-fous P0/P1/P2, RAG,
LLM local, import PDF/audio, interface redessinée). Il serait utile de lui
envoyer un état des lieux réel plutôt que de la laisser croire que rien
n'est fait — je peux préparer cette fiche de suivi si tu veux la lui
transmettre.

## Décisions prises et mises en œuvre (suite à cette analyse)

- **TEG** : reste retiré de l'affichage, conformément à la demande explicite
  du matin — le cadrage de Lory le liste comme preuve de démo attendue,
  mais le choix a été fait de le garder masqué pour l'instant. Le moteur
  (`regulatory/computeTEG.mjs`) et le composant (`RegulatoryPanel.jsx`)
  restent en place, réactivables en une ligne dans `App.jsx` si besoin
  avant la présentation.
- **Confiance → qualité du dossier + fiabilité et limites** ✅ construit :
  `scoring/assessDossierQuality.mjs` (nouveau module pur, 11 tests) calcule
  une **complétude** (proportion de champs suivis réellement renseignés,
  cf. `CHAMPS_SUIVIS`) et des **alertes de cohérence** documentées
  (bénéfice nul/négatif, montant très disproportionné, ancienneté sous le
  seuil finançable, durée hors plage usuelle, secteur peu représenté dans
  les données d'entraînement) — jamais une mesure de la probabilité que la
  prédiction soit correcte, exactement la distinction demandée section 3.
  Le champ `confidence` reste calculé et stocké (compatibilité), mais n'est
  plus affiché nulle part dans l'interface. `DossierForm.jsx` transmet
  désormais `null` (au lieu d'un 0 silencieux) pour les champs réellement
  laissés vides, afin que "qualité du dossier" puisse les détecter — cf.
  `scoring/scoreCreditApplication.mjs`, qui appliquait déjà ses propres
  valeurs par défaut en interne (`?? 35`, `?? 0`...), donc rien ne casse.
  Vérifié de bout en bout (Playwright) : un dossier avec plusieurs champs
  vides affiche "Fiabilité et limites" avec chaque champ manquant nommé,
  et un dossier agricole à montant disproportionné déclenche les deux
  alertes de cohérence correspondantes.

## Deuxième passe — le reste du document traité (même jour)

Suite à "oui tout", les points restants identifiés plus haut ont été
construits :

- **Contrôle qualité en amont + abstention** ✅ — `scoring/checkAbstention.mjs`
  (nouveau, 9 tests) s'exécute AVANT `scoreCreditApplication` : si un champ
  critique manque (montant, CA, secteur, durée) ou que le dossier sort du
  domaine couvert par le modèle (ancienneté d'activité sous le seuil
  finançable de 6 mois, secteur non entraîné), le scoring n'est jamais
  appelé. Le dossier reste enregistré avec une décision "abstention"
  distincte (jamais un chiffre inventé), affiche les motifs précis, et un
  bouton "Compléter le dossier" réouvre le formulaire pré-rempli avec ce qui
  a déjà été saisi. Vérifié de bout en bout : un dossier trop jeune est
  bloqué, complété, puis correctement scoré une fois corrigé. Au passage, la
  contrainte HTML native `min="6"` sur le champ ancienneté a été retirée :
  elle bloquait silencieusement la soumission avant même que notre message
  métier explicite ne puisse s'afficher.
- **Calibration du modèle** ✅ — `ml/train_model.py` calcule désormais une
  table de calibration (probabilité prédite vs taux de défaut observé, par
  quintile sur le jeu de test), ajoutée à `ml/METRICS.md`. Résultat honnête :
  la calibration est raisonnable sans être parfaite (légère sous-estimation
  dans les tranches intermédiaires) — normal vu la taille du jeu de test.
- **Traçabilité** ✅ partiellement — `ml/model.json`/`scoring/model.js`
  avaient déjà une version, le fichier source et les tailles train/test ; la
  graine aléatoire (`random_state=42`) est maintenant explicitement tracée
  dans le modèle exporté. La graine de génération des données synthétiques
  elles-mêmes reste hors de notre contrôle (processus de Prisca).
- **TEG "contrôle non validé"** ✅ — `computeTEG` distingue maintenant un
  taux/plafond explicitement fourni d'une valeur par défaut silencieuse, via
  un champ `valide`. Le moteur reste testé même si le panneau associé n'est
  pas affiché actuellement.
- **Politique de rétention/purge** ✅ — `purgeOldSyncedApplications` supprime
  les dossiers déjà synchronisés au-delà d'une durée par défaut (90 jours,
  placeholder documenté comme `DEFAULT_TAUX_USURE`), jamais un dossier pas
  encore synchronisé. Appelée automatiquement au démarrage de l'app.
- **Fiche de suivi pour Lory** ✅ — `FICHE_SUIVI_EQUIPE.md`, composant par
  composant (état, tâche restante, blocage, preuve), dans l'ordre qu'elle a
  demandé.

## Ce qui reste ouvert malgré tout

- **Chiffrement du stockage local** — non implémenté et assumé comme limite
  connue. IndexedDB n'est pas chiffré nativement, et une vraie couche de
  chiffrement (gestion de clés, verrouillage du terminal) est un chantier
  distinct, pas réalisable de façon fiable dans le temps du hackathon.
  Documenté honnêtement dans `FICHE_SUIVI_EQUIPE.md` plutôt que passé sous
  silence.
- Le pipeline audio (transcription réelle avec un `whisper-server` démarré)
  reste à vérifier sur la machine de démo — non testable dans cet
  environnement.
- La décision sur l'affichage du TEG/de la rentabilité reste celle prise ce
  jour (retirés) — à reconfirmer avant la présentation si besoin.
