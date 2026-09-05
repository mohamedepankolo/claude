# Notes — session de mentoring CIF (retranscription partielle)

Synthèse d'une session de mentoring au hackathon, deux voix : une experte
métier crédit/microfinance, et un mentor technique répondant aux questions
RAG/fine-tuning des équipes. Transcription automatique de qualité moyenne —
ce qui suit est une reconstruction du sens, pas une citation fiable mot à mot.

## Métier crédit

- **Le type de garantie compte plus que sa seule présence.** Une garantie
  qui s'apprécie dans le temps (parcelle/foncier) est plus sûre : même en
  cas de retard, sa valeur future couvre le crédit → taux plus bas possible.
  Une garantie qui se déprécie (véhicule, moto) expose l'institution : si le
  client rembourse en retard, l'actif vaut moins que le solde restant → le
  taux doit compenser ce risque. Une caution personnelle (aval) porte un
  risque différent : le garant peut disparaître.
  → Notre `capacite_caution` (0-1) est aujourd'hui un score générique qui ne
  distingue ni le type d'actif ni sa trajectoire de valeur. Amélioration
  réelle mais qui demande une variable supplémentaire (type de garantie)
  absente du dataset actuel — à discuter avec Prisca si le temps le permet.
- **Durées de crédit** : jusqu'à 20 ans en banque (construction), 5 ans max
  pour certains crédits ; en microfinance, 1 an la norme, 2 ans l'exception,
  calé sur les cycles (campagne agricole, crédit fête). Confirme la
  distribution déjà présente dans `data/donnees_completes.csv` (12 mois
  ≈70%) — rien à changer.
- **Les paramètres de risque varient par secteur.** Le commerce est linéaire
  (flux réguliers, comparables d'un dossier à l'autre). L'agriculture est
  cyclique : le risque dépend de l'historique de production ET des
  prévisions météo combinées. Conseil du mentor : construire d'abord un
  modèle général sur le(s) secteur(s) où on a le plus de données
  (`commerce_detail` : 1079/3000 lignes chez nous), puis ajouter des modèles
  spécialisés par secteur progressivement — cohérent avec la note de
  présentation de l'équipe ("spécialisable par segment"), avec un détail
  concret en plus pour un futur module agriculture (météo + production
  passée).
- **Grille d'entretien terrain** (utile pour calibrer l'extraction audio à
  construire) : identité, stock, chiffre d'affaires évalué sur l'année,
  date du dernier crédit pris, nombre d'échéances passées, vérification
  mensuelle des comptes. Recoupe les variables déjà modélisées
  (`chiffre_affaires`, `a_historique`, `nb_credits_anterieurs`...).
- **Absence d'historique bancaire ≠ dossier bloqué** : on évalue sur les
  autres critères disponibles — confirme l'approche "cold start" déjà
  implémentée dans `scoring/scoreCreditApplication.mjs`.

## Technique — RAG / LLM local

- Le RAG expliqué par le mentor ("la communication avec le modèle est basée
  sur les données existantes") correspond exactement à ce que fait
  `app/src/llm/llmClient.js` : le contexte du dossier est injecté dans le
  prompt plutôt que de fine-tuner un modèle. Approche déjà alignée.
- Conseil : privilégier un modèle local à peu de paramètres, faisable à
  installer et tester (nom mal transcrit dans l'audio, probablement un
  outil comme Ollama). Cohérent avec notre choix Mistral 7B Q4 + llama-server.
- Conseil fort, à suivre pendant l'événement : **aller voir les experts
  métier/conformité de la CIF présents sur place**, leur demander
  concrètement où sont leurs points de blocage actuels, pour calibrer le
  prototype sur leurs vrais besoins. Le message de clôture (garbled mais le
  sens est clair) : la CIF ne veut pas "encore une application" déconnectée
  du métier — la valeur attendue est d'aider à résoudre le vrai problème,
  pas de présenter un prototype qui ne répond qu'à ce qu'on imaginait.

## Session 2 — priorités et contraintes d'infrastructure

- **Discipline de scope, le point le plus important de cette session** : le
  mentor est explicite — *"votre solution doit être de pouvoir faire le
  scoring seulement. Si vous vous attardez à renseigner les informations,
  je ne pense pas que vous allez vraiment finir. [...] La compétition va se
  jouer sur les détails, le nombre de fonctionnalités."* Ne pas investir de
  temps sur un formulaire d'onboarding élaboré (le compte client est censé
  déjà exister dans le système) : concentrer l'effort sur la profondeur du
  moteur de scoring/analyse (explicabilité, cas limites, fonctionnalités
  d'analyse). Cohérent avec la direction déjà prise (modèle entraîné,
  explications, audit d'équité, chat) plutôt qu'un formulaire d'intake plus
  poussé.
- **Contrainte d'infrastructure confirmée, pas un simple "nice to have"** :
  la CIF a explicitement quitté le cloud et ne priorise aucune API externe
  — *"externe, on ne priorise pas, on priorise tout en interne [...] on a
  quitté le cloud, on n'est plus sur le cloud"* — à cause des coupures
  réseau fréquentes. L'IA doit pouvoir "apprendre et être indépendante
  d'Internet". Ça renforce (au niveau organisationnel, pas seulement
  technique) le choix du LLM local (Mistral/llama-server, aucun appel API
  cloud) et du scoring 100% local déjà retenus.
- **BIC (bureau d'information sur le crédit)** : interconnecté aux réseaux
  sociaux côté CIF, mais ne couvre que les personnes ayant déjà eu un
  crédit — confirme que le cold start doit reposer sur d'autres signaux
  (déjà notre approche). Beaucoup d'équipes vont bâtir sur des données
  type BIC : la différenciation ("plus-value") doit se jouer ailleurs.
- **Le montant soutenable prime sur le montant demandé** : exemple donné
  par le mentor — un revenu de 100 000 FCFA/mois ne justifie pas un crédit
  de 50 millions sur 24 mois ; l'outil doit simuler et proposer ce que le
  client peut réellement emprunter. C'est exactement le rôle de
  `recommended_amount` dans notre contrat de scoring.
- **Variables spécifiques par activité (exemples concrets supplémentaires)** :
  agriculture → périmètre du champ ; pisciculture → volume en m³. Vient
  enrichir la piste "modèles/champs spécialisés par secteur" déjà notée en
  Session 1.
- **Aucun outil interne existant ne fait le scoring** : le système actuel
  de la CIF ne fait que le montage et l'impression du dossier de crédit, pas
  le calcul lui-même, et rien n'est relié. Bon argument de positionnement :
  la solution comble un vide réel, ce n'est pas une redite d'un outil existant.
- **Cible produit côté CIF** : passage du desktop (Java Swing, une install
  par machine) vers du web centralisé (une seule application, moins de
  maintenance). Prise en main quasi immédiate attendue côté agent (peu de
  formation).

## Session 3 — méthodologie complète d'évaluation du risque (Prisca)

Session la plus dense et la plus actionnable à ce jour : la grille complète
utilisée par les agents de crédit, dimension interne puis externe. Sert de
référence pour vérifier ce que notre modèle couvre déjà et ce qui reste un
vrai vide de données.

### Dimension interne du risque

1. **Données personnelles du membre** : identité, âge, résidence, emploi,
   provenance, profession.
2. **Activité et capacité de remboursement** :
   - Produits vendus, canaux de distribution, clientèle, facilité
     d'approvisionnement (accès fournisseur).
   - **Croissance des ventes** mois après mois.
   - **Secteur porteur** : perspectives à 5 ans, viabilité dans la durée.
   - **Pertinence saisonnière des besoins** — point développé en détail par
     l'exemple du vendeur d'eau en sachet : demander un crédit en décembre
     (saison froide, ventes en baisse) est un mauvais timing ; le bon moment
     est en amont de la période de pointe (février, pour la saison
     mars-juin). Un besoin de crédit mal calé sur le cycle de l'activité est
     en soi un facteur de risque, indépendamment du dossier financier.
   - **Rentabilité de l'activité** : marge = prix de vente − (coût d'achat +
     charges : salaires, loyer, dépenses courantes). Marge positive → activité
     viable ; marge négative → le crédit ne doit pas partir, quelle que soit
     la garantie proposée.
3. **Situation financière** :
   - **Flux de trésorerie** : mouvements et dépôts sur compte, moyenne
     mensuelle comparée à la traite (mensualité) à honorer. Un dépôt
     fractionné en petits montants incompatible avec le montant demandé est
     un signal d'alerte fort (illustré par l'exemple des dépôts de 1000 FCFA
     pour une demande de 10 millions). Analyse recommandée sur ~2 mois de
     mouvements avant la décision, idéalement sur une année complète pour
     détecter une activité en déclin (ventes qui chutent 4 mois avant la
     demande de crédit = signal d'alerte).
   - **Niveau d'endettement** dans d'autres institutions (recoupe le BIC,
     cf. dimension externe ci-dessous).
   - **Bilan rapide** : actif circulant (ce qui permet de faire tourner
     l'activité) comparé aux dettes à payer. Exemple donné : actif circulant
     15M contre 20M de dettes → dossier déjà problématique avant même
     d'étudier le reste.
4. **Historique de remboursement** :
   - Nombre de crédits pris dans l'institution, incidents de paiement
     (retards) → impacte directement la **moralité** du membre, qu'il ait eu
     l'incident chez nous ou ailleurs.
   - **Progressivité du crédit ("antécédent")** — principe explicite et fort :
     le montant d'un nouveau crédit doit être cohérent avec l'historique du
     membre. Passer de 500 000 à 10 millions d'un coup est un signal
     d'alerte : ça dépasse l'ampleur réelle de l'activité, avec un risque que
     le surplus soit détourné (achat de bien personnel plutôt qu'investi dans
     l'activité) et ne soit jamais remboursé. Analogie de l'agent : on ne
     saute pas du CP1 au CM2, chaque palier de crédit remboursé construit
     l'espérance/la confiance pour le palier suivant.
5. **Garanties** :
   - Types : PUH (permis urbain d'habiter), titre foncier, carte grise,
     matériel/équipement (si revendable), cautionnement solidaire (un
     co-emprunteur paie à la place du membre défaillant), domiciliation de
     salaire pour les salariés.
   - **Le ratio garantie/montant compte autant que le type** : une garantie
     de 2M sur un crédit de 10M ne protège quasiment rien ; il faut une
     garantie dont la valeur est comparable au montant emprunté.
   - Doit être **réalisable** (vendable rapidement en cas de défaut), pas
     seulement présente sur le papier.
6. **Ancienneté dans l'institution** : un membre historique (10 ans) n'est
   pas évalué comme un nouveau membre du jour.
7. **Le type de crédit change les critères d'évaluation, pas seulement le
   score final** :
   - Salarié → domiciliation du salaire comme garantie ; crédit scolaire
     ~10 mois, crédit véhicule plus long.
   - Crédit productif (fonds de roulement, équipement, immobilier) → plafond
     général ~48 mois ; fonds de roulement 12-18 mois ; équipement ~24 mois ;
     immobilier ~48 mois.
   - Agriculture → risque pluviométrique, accès à un site d'exploitation,
     historique de production.
   - Commerce → disponibilité produit, clientèle, fournisseur.
   - BTP / marché public → crédibilité et solvabilité du maître d'ouvrage
     (celui qui a commandé le marché), capacité réelle du promoteur à
     exécuter (matériel, compétence).
8. **Le taux n'est PAS un facteur d'évaluation du risque** — affirmé
   plusieurs fois, sans ambiguïté : *"le taux est déjà prédéfini [...] le
   taux n'a rien à voir avec l'évaluation du risque"*. Le taux est fixé par
   la politique de l'institution, jamais ajusté au cas par cas selon le
   profil de risque (contrairement à certaines banques où le taux se
   négocie). **Confirme une décision d'architecture déjà prise** : notre
   `scoreCreditApplication` ne fixe ni ne consulte jamais de taux, et
   `computeTEG`/`computeViability` restent des calculs séparés, appliqués
   après coup sur un taux saisi manuellement par l'agent.

### Dimension externe du risque — le BIC

- **Le BIC (Bureau d'Information sur le Crédit)** est une structure privée
  sous contrat avec la banque centrale (BCEAO/UMOA) pour assainir le
  portefeuille crédit de toute la zone (8 pays).
- **Obligation réglementaire** : chaque institution affiliée transmet
  mensuellement (format XML) tous ses crédits au BIC, avant le 10 du mois
  suivant, sous peine de sanction.
- **Consultation obligatoire avant octroi** : l'agent de crédit interroge le
  BIC par CNIB/nom/prénom/date de naissance/téléphone ; le système retourne
  tous les engagements du membre dans toutes les institutions affiliées
  (banques, IMF, établissements de crédit).
- **Objectif principal : lutter contre la "cavalerie financière"** — un
  membre qui emprunte dans une institution "relax" pour rembourser une
  banque plus stricte qui le presse, en cycle continu, sans jamais assainir
  sa dette réelle.
- **"Grands facturiers"** : l'ONEA (eau) et la SONABEL (électricité)
  transmettent aussi leurs impayés au BIC. Un membre à jour du crédit mais
  avec 5 mois d'impayés d'électricité est un signal de discipline financière
  douteuse.
- **"Alerting"** (fonctionnalité en cours d'expérimentation au BIC) : notifie
  l'institution quand un de ses membres ouvre un compte ailleurs, pour
  permettre un contact proactif avant qu'il ne parte pour de bon.
- **Consultation payante** → génère un "rapport de solvabilité" en PDF ;
  recommandation forte de l'experte : **archiver ce rapport dans une
  bibliothèque interne** (fichier joint au dossier, ou table dédiée
  alimentée en CSV/Excel) pour ne pas payer deux fois la même information et
  constituer une base d'historique réutilisable.
- **S'applique aussi en interne, multi-agences** : si un membre a déjà un
  crédit dans une autre agence de la même institution, le système doit le
  détecter lui-même (le BIC ne couvre que l'inter-institutionnel).

### Implications pour Baraka Score

Ce qui est **déjà couvert ou confirmé** par notre architecture actuelle :

- Le montant soutenable prime sur le montant demandé → `recommended_amount`.
- Approche "cold start" sans historique → déjà l'approche de
  `scoreCreditApplication.mjs`.
- **Le taux ne doit jamais être un input ou un output du scoring** — validé
  à 100% par notre séparation stricte scoring / `computeTEG` / `computeViability`.
  Aucun changement nécessaire, mais bon à citer explicitement si on nous
  pose la question en soutenance : ce n'est pas un oubli, c'est conforme à
  la pratique réelle de l'IMF.
- `nb_credits_anterieurs`, `nb_retards`, `a_historique`, `chiffre_affaires`,
  `capacite_caution` couvrent une partie de l'historique et des garanties.

**Vrais vides de données**, à ne pas fabriquer sans confirmation de Prisca
(le dataset synthétique actuel ne les contient pas) :

- **Progressivité du crédit** : montant demandé vs montants des crédits
  antérieurs (ratio). On a `nb_credits_anterieurs` mais pas leurs montants —
  une variable manquante potentiellement forte, à demander à Prisca.
- **Pertinence saisonnière** : pas de champ de date de la demande ni de
  cycle sectoriel dans le dataset — hors de portée du modèle statistique
  actuel, resterait un point d'attention qualitatif pour l'agent, pas un
  input chiffré.
- **Bilan rapide** (actif circulant vs dettes) : donnée non collectée dans
  notre dataset, réaliste seulement pour des activités formalisées.
- **Endettement externe réel (BIC)** : notre dataset n'a aucune donnée BIC.
  Un vrai déploiement production nécessiterait une intégration BIC (hors
  cadre hackathon, API externe payante) — mais un champ manuel simple
  ("endettement déclaré ailleurs", saisi par l'agent après consultation BIC)
  serait une amélioration réaliste et peu coûteuse à ajouter à l'UI, même
  sans automatiser la requête BIC elle-même.
- **Détection multi-agences interne** : hors de portée du prototype actuel
  (IndexedDB local par navigateur, pas de backend partagé) — à noter dans
  "Ce qui reste" de `ARCHITECTURE.md` comme un vrai besoin de la future
  synchronisation Firestore, pas une fonctionnalité de scoring.

Aucun changement de code déclenché par cette session pour l'instant — ces
points nécessitent soit une donnée que Prisca doit fournir/confirmer soit un
choix de priorité de l'équipe (cf. discussion à avoir : ajouter un champ
"endettement externe déclaré" simple dans le formulaire ?).
