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
