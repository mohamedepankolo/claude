# Baraka Score — guide de démo (testé en local avant présentation)

Tout ce document a été vérifié en exécutant réellement le pipeline complet
(scoring entraîné → garde-fous métier → TEG → rentabilité → RAG → chat) et
en pilotant l'app dans un vrai navigateur (Playwright) : suite de tests
(43 tests unitaires, 0 échec), build de production, et un parcours complet
formulaire → décision → tous les panneaux → hors-ligne/reconnexion →
rechargement de page. Rien ci-dessous n'est théorique.

## 1. Démarrer en local

```bash
cd app
npm install      # une seule fois
npm run dev      # démarre sur http://localhost:5173 (ou le port affiché)
```

Aucune autre installation n'est nécessaire : IndexedDB est natif au
navigateur, le modèle de scoring est déjà "compilé" en JS
(`scoring/model.js`), et l'app fonctionne même sans connexion internet.

**LLM local (optionnel)** : si tu veux montrer le chat et l'assistant RAG
avec de vraies réponses reformulées (plutôt que le mode de repli), démarre
`llama-server` avec le fichier `.gguf` avant d'ouvrir l'app (cf.
`llm/README.md`). **Ce n'est pas bloquant** : sans lui, le chat et le RAG
répondent quand même, avec des règles déterministes / les passages bruts du
corpus — jamais une erreur, jamais un texte inventé. C'est même un bon
argument à dire à voix haute pendant la démo : *"même sans le LLM, l'outil
reste utilisable — c'est le plan B prévu dès le départ."*

## 2. Ordre de l'écran une fois un dossier créé

1. **Résultat** — score /100, décision, montant recommandé, facteurs du
   modèle, puis **garde-fous métier** s'il y en a (encadré séparé, avec un `!`).
2. **Vérifications externes** — archive locale des vérifications
   d'endettement externe (à ne pas confondre avec une vraie consultation BIC,
   cf. §5).
3. **Rentabilité pour l'institution** — marge de la CIF sur ce crédit précis.
4. **Simuler le crédit — conformité TEG** — volontairement en dernier
   (retour de Prisca : le taux n'est jamais un facteur de risque, seulement
   une vérification de conformité une fois la décision prise).
5. **Assistant réglementaire (RAG)** puis **chat sur le dossier**.

## 3. Le formulaire, champ par champ

### Identité & activité
- **Nom du demandeur** : texte libre, obligatoire.
- **Genre** : jamais utilisé par le score (audit d'équité uniquement) —
  laisse-le si tu veux, ça ne change rien à la décision.
- **Âge, Zone, Secteur d'activité** : influencent le score.
- **Ancienneté de l'activité** : minimum 6 mois pour être finançable
  (règle validée par Prisca).
- **Activité informelle** : coche si le commerce n'est pas déclaré.

### Capacité de remboursement
- **Chiffre d'affaires mensuel** et **Charges de l'activité** : leur
  différence = le bénéfice réel utilisé par le score (`revenu_activite`),
  pas le chiffre d'affaires brut.
- **Flux de trésorerie net** : laisse vide pour qu'il soit égal au bénéfice
  par défaut (comportement du contrat de scoring).

### Crédit demandé
- **Montant demandé** et **Durée** : la mensualité et le taux d'endettement
  en découlent directement.
- **Type de crédit** *(nouveau)* : ne change pas le score, sert uniquement
  à vérifier si la durée choisie est dans la norme habituelle pour ce type
  (affiché comme information, jamais bloquant).

### Évaluation terrain *(nouveau — jugement déclaré par l'agent)*
- **Pertinence saisonnière du besoin** : "est-ce le bon moment pour ce
  crédit ?" (exemple de Prisca : le vendeur d'eau en sachet qui demande un
  crédit en pleine saison froide). Mets `Défavorable` pour déclencher un
  garde-fou et illustrer ce point en démo.
- **Croissance des ventes déclarée (%)** : peut être négative. En-dessous de
  -20%, ça déclenche un garde-fou "activité en déclin".

### Relation avec l'institution & endettement externe *(nouveau)*
- **Ancienneté du membre dans l'institution** : différent de l'ancienneté de
  l'activité — un nouveau membre (< 6 mois) voit son montant recommandé
  automatiquement réduit (70% du montant initial).
- **Endettement externe déclaré** : montant que l'agent a vérifié ailleurs
  (proxy du rapport BIC, cf. §5). Élevé par rapport au bénéfice → garde-fou.

### Épargne & discipline financière / Historique de crédit
- Comme avant, plus **Montant du dernier crédit** *(nouveau)* : sert au
  garde-fou de "progressivité du crédit" (l'analogie CP1→CM2 de Prisca : le
  nouveau montant ne doit pas être disproportionné par rapport au dernier
  crédit connu — seuil par défaut : ×3).

### Garanties & réputation
- Comme avant, plus **Type de garantie** et **Valeur estimée de la
  garantie** *(nouveaux)* : si la garantie déclarée couvre moins de 50% du
  montant demandé, un garde-fou se déclenche.

## 4. Trois dossiers-témoins prêts à l'emploi

Vérifiés par le vrai moteur (pas des exemples théoriques). Utilise-les tels
quels pour rehearsal, ou comme base à adapter.

### Dossier 1 — cas propre (tout est vert)
| Champ | Valeur |
|---|---|
| Nom | Aminata Compaoré |
| Âge / Zone / Secteur | 38 / Urbain / Commerce de détail |
| Ancienneté activité | 36 mois |
| Chiffre d'affaires / Charges | 500 000 / 180 000 FCFA |
| Montant demandé / Durée | 600 000 FCFA / 18 mois |
| Épargne mensuelle / Régularité | 40 000 FCFA / 0.9 |
| Participe à une tontine / Régularité | Oui / 0.85 |
| Historique : crédits antérieurs / retards | 2 / 0 |
| Caution / Solidité | Oui / 0.8 |
| Réputation de terrain | 0.85 |

**Résultat attendu** : score **100**, décision **accordable**, montant
recommandé ≈ **690 000 FCFA**, **aucun garde-fou**. TEG à 18% (valeur par
défaut du panneau) → **conforme** (≈19.6% ≤ 24%). Rentabilité : mets **30%**
dans le panneau dédié (valeur par défaut désormais) → **marge viable**
(≈11%, ≥ seuil de 5%).

### Dossier 2 — le modèle approuverait seul, le garde-fou l'arrête
| Champ | Valeur |
|---|---|
| Nom | Yacouba Sawadogo |
| Âge / Zone / Secteur | 34 / Urbain / Commerce de détail |
| Ancienneté activité | 24 mois |
| Chiffre d'affaires / Charges | 600 000 / 200 000 FCFA |
| Montant demandé / Durée | 900 000 FCFA / 18 mois |
| Épargne mensuelle / Régularité | 30 000 FCFA / 0.8 |
| Participe à une tontine / Régularité | Oui / 0.8 |
| Historique : a un historique, 1 crédit antérieur, 0 retard |
| **Montant du dernier crédit** | **200 000 FCFA** ⚠️ |
| **Ancienneté du membre** | **20 mois** |
| Caution / Solidité | Oui / 0.7 |
| Réputation de terrain | 0.75 |

**Résultat attendu** : le modèle seul donnerait score **99**, **accordable**,
≈**1 035 000 FCFA** recommandés. Mais 900 000 FCFA demandés représente plus
de 3× le dernier crédit connu (200 000) → le garde-fou **"Montant
disproportionné par rapport à l'historique"** se déclenche : décision
ramenée à **à examiner**, montant plafonné à **600 000 FCFA**. C'est LE
moment de la démo qui montre la valeur ajoutée des garde-fous : le modèle
ne voit que les chiffres du dossier, pas la trajectoire de confiance décrite
par Prisca.

### Dossier 3 — le modèle rejette seul, sans même besoin de garde-fou
| Champ | Valeur |
|---|---|
| Nom | Salif Ouédraogo |
| Âge / Zone / Secteur | 45 / Rural / Agriculture |
| Ancienneté activité | 8 mois |
| Chiffre d'affaires / Charges | 150 000 / 130 000 FCFA |
| Montant demandé / Durée | 800 000 FCFA / 18 mois |
| Épargne mensuelle / Régularité | 2 000 FCFA / 0.1 |
| Historique : a un historique, 3 crédits antérieurs, **4 retards**, **impayé** |
| Caution | Non |
| Réputation de terrain | 0.3 |

**Résultat attendu** : score **0**, décision **non recommandé**, montant
plafonné à 50 000 FCFA — le modèle entraîné rejette seul, sur les
fondamentaux (bénéfice quasi nul, retards répétés, impayé). Bon exemple pour
montrer que le modèle a déjà un vrai pouvoir discriminant, indépendamment
des garde-fous.

## 5. Points à dire/assumer si on te pose la question en direct

- **Le taux affiché dans "Rentabilité" (30% par défaut) diffère de celui du
  panneau TEG (18% par défaut) — c'est volontaire.** Les deux panneaux
  simulent des choses différentes et acceptent chacun leur propre taux :
  celui auquel le crédit est légalement proposé (TEG) et celui utilisé pour
  modéliser l'économie interne (rentabilité). Ce n'est pas un bug, c'est
  l'illustration concrète du principe "TEG ≠ rentabilité" que Prisca a
  insisté à séparer.
- **"Vérifications externes" n'interroge pas le vrai BIC.** C'est assumé et
  documenté (`PLAN_RISQUE.md`) : ça archive ce que l'agent a déjà vérifié
  (à la main ou via un vrai rapport BIC papier/PDF), ça ne fait pas
  d'appel API réel — hors de portée technique du prototype (contrat BCEAO).
- **Le "doublon de dossier" (P2)** est détecté uniquement dans la base
  locale de CE navigateur, pas entre agences (ça suppose un vrai backend
  partagé, pas encore branché).
- **Le taux d'usure (24%) et les paramètres économiques de rentabilité
  (6%, 5%, 60%, 5%…) sont des placeholders documentés**, pas des valeurs
  BCEAO ou CIF confirmées — dis-le si on te demande d'où ils viennent.

## 6. Checklist avant de partir en démo

- [ ] `npm run dev` démarre sans erreur, l'app s'ouvre dans le navigateur.
- [ ] Créer le Dossier 1 → vérifier "accordable", aucun garde-fou.
- [ ] Calculer la rentabilité à 30% → "Crédit rentable pour l'institution".
- [ ] Calculer le TEG à 18% → "Conforme au plafond".
- [ ] Créer le Dossier 2 → vérifier que le garde-fou de progressivité
      s'affiche et que la décision passe à "à examiner".
- [ ] Poser une question à l'assistant réglementaire (RAG) → une réponse
      sourcée s'affiche (avec ou sans `llama-server`).
- [ ] Couper le wifi, créer un petit dossier, vérifier le badge "en attente
      de synchronisation", reconnecter, vérifier qu'il passe à "Synchronisé".
- [ ] Recharger la page → l'historique des dossiers est toujours là.
