# Éléments de pitch — Thématique 02 (Akili)

Préparé pour démarrer le travail du pitch pendant que le blocage GitLab se
règle. Trois blocs demandés : problématique, proposition de valeur,
caractère innovant. Rédigé à partir de ce qui est réellement construit et
sourcé dans ce dépôt (`ARCHITECTURE.md`, `PLAN_RISQUE.md`,
`SOURCES_METHODOLOGIE.md`, `NOTES_MENTORING_CIF.md`) — rien d'inventé pour
l'occasion.

## 1. Problématique claire

Une institution de microfinance/coopérative doit décider, pour chaque
demande de crédit, **combien prêter et à qui**, sans les outils dont
disposent les banques classiques :

- **Pas d'historique bancaire pour la majorité des demandeurs** — le
  bureau d'information sur le crédit (BIC) ne couvre que ceux qui ont déjà
  eu un crédit. Pour un primo-demandeur (la majorité des dossiers en
  microfinance), il n'y a rien à consulter.
- **Le revenu réel est difficile à vérifier** — activité souvent
  informelle, pas de comptabilité, le chiffre d'affaires déclaré est une
  estimation orale de l'agent de terrain, pas un document audité.
- **L'évaluation est aujourd'hui manuelle, lente et inégale d'un agent à
  l'autre** — un dossier n'est pas jugé deux fois de la même façon selon
  qui l'instruit ; aucun outil interne de la CIF ne calcule aujourd'hui un
  score, le système existant se limite au montage et à l'impression du
  dossier.
- **Le risque est réel et documenté** : le taux de créances en souffrance
  du secteur de la microfinance au Burkina Faso atteint 7,4% (APSFD-BF,
  2024), et la fourchette régionale (PAR30) va de 8% à 20% en Afrique
  subsaharienne (CGAP/MIX) — largement au-dessus des standards
  internationaux. Une institution qui prête sans outil d'aide à la décision
  prend ce risque à l'aveugle, ou se protège en refusant trop de dossiers
  solvables.
- **Contrainte de terrain non négociable** : les coupures réseau sont
  fréquentes, et l'institution a explicitement quitté le cloud pour tout
  ré-internaliser — un outil qui dépend d'une API externe ou d'une connexion
  permanente n'est pas utilisable sur le terrain.

**En une phrase** : les agents de crédit décident sans donnée fiable, sans
outil, sans garantie de cohérence — et le font dans un contexte où l'accès
à Internet n'est pas garanti.

## 2. Proposition de valeur

Akili est un **assistant d'aide à la décision de crédit**, pas un outil qui
décide à la place de l'agent :

- **Un score de risque entraîné et évalué** (régression logistique,
  ROC-AUC 0.83, calibration vérifiée), qui remplace l'intuition seule par
  une mesure reproductible — mais reste une recommandation, jamais une
  décision automatique.
- **Un montant soutenable, pas seulement le montant demandé** — l'outil
  calcule ce que le client peut réellement rembourser (capacité, pas
  souhait), conformément à l'exigence explicite exprimée en mentoring :
  *"un revenu de 100 000 FCFA/mois ne justifie pas un crédit de 50
  millions."*
- **La conformité réglementaire vérifiée automatiquement** (taux d'usure
  BCEAO, 24% pour les IMF, TEG calculé et comparé au plafond) — élimine un
  risque de non-conformité qui serait autrement découvert après coup.
- **Une explication en langage naturel, générée pour chaque dossier**, pas
  seulement à la demande — l'agent peut justifier sa décision au client et
  à sa hiérarchie sans reconstruire lui-même le raisonnement.
- **Un filet de sécurité qui refuse de deviner** : si un dossier est trop
  incomplet ou hors du domaine couvert par le modèle, l'outil s'abstient
  explicitement plutôt que de produire un score peu fiable — et dit
  pourquoi.
- **Une saisie qui s'adapte au terrain, pas l'inverse** : formulaire,
  document scanné (avec OCR), ou entretien enregistré — la même donnée
  arrive au moteur de scoring quel que soit le canal utilisé par l'agent.
- **Fonctionne sans connexion** — scoring, OCR, assistant, stockage :
  tout tourne en local. La synchronisation se fait quand le réseau revient,
  jamais un blocage en son absence.

**En une phrase** : Akili donne à chaque agent, où qu'il soit et avec ou
sans réseau, le même niveau d'analyse que l'institution la mieux outillée.

## 3. Caractère innovant

- **Conçu pour l'absence de réseau, pas juste tolérant à sa perte** —
  scoring, OCR (reconnaissance de texte sur documents scannés/photos), et
  assistant en langage naturel tournent tous en local, sans aucun appel à
  une API externe. La plupart des outils de scoring/IA du marché supposent
  une connexion cloud permanente ; Akili part de la contrainte réelle du
  terrain plutôt que de l'ignorer.
- **Le score ne se substitue jamais au jugement humain — il est structuré
  pour ça** : trois couches strictement séparées et auditables
  indépendamment (le score ML, la conformité réglementaire, les garde-fous
  métier), plutôt qu'une boîte noire qui mélange tout. Chaque garde-fou
  métier ne peut que durcir une décision, jamais l'assouplir — impossible
  qu'une règle de sécurité soit contournée silencieusement.
- **L'abstention comme choix de conception, pas comme une limite subie** :
  plutôt que de forcer un score sur un dossier hors du domaine
  d'entraînement du modèle, l'outil le dit et demande un complément —
  un choix de sobriété rare dans les outils de scoring, où l'incitation
  naturelle est de toujours produire un chiffre.
- **Veille employeur/activité avec revue humaine obligatoire** : l'outil
  peut détecter qu'un événement (perte d'emploi, fermeture d'activité)
  fragilise un dossier déjà accordé — mais ne modifie jamais le score
  automatiquement ; un agent confirme ou écarte l'alerte avant toute
  réévaluation. La plupart des outils de "monitoring" du risque de crédit
  agissent automatiquement ; ici, l'automatisation s'arrête à l'alerte.
- **Une méthodologie sourcée, pas seulement plausible** : chaque paramètre
  du jeu de données synthétique est relié à une source externe vérifiable
  (BCEAO, INSD, APSFD-BF, CGAP/MIX, Global Findex...) — une rigueur rare
  pour un prototype de hackathon, qui permet de défendre chaque choix
  devant un jury ou un mentor technique.
- **Comble un vide réel, pas une redite** : le système actuel de la CIF ne
  fait que le montage et l'impression du dossier de crédit — aucun outil
  interne existant ne calcule un score. Akili n'est pas une nouvelle
  interface pour un problème déjà résolu ailleurs dans l'organisation.
