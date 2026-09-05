# Baraka Score — interface, documents & entretien (plan de travail, non commencé)

Capture fidèle de la demande du 5 septembre, pour ne rien perdre avant de
prioriser. **Rien de ce document n'est construit** — c'est une feuille de
route à discuter, pas un état d'avancement.

## 1. BIC — facultatif, avec un bouton pour passer

Clarification importante : le BIC n'est **pas obligatoire** avant la
décision. Le flux correct :
1. Le score et la décision sortent normalement (comme aujourd'hui), **sans**
   attendre d'information BIC.
2. Après la décision, un encart facultatif propose d'ajouter un rapport de
   solvabilité BIC — avec un bouton clair du type **"Passer"** / "Ne pas
   renseigner maintenant".
3. Si l'agent **insère le PDF du rapport** : un programme extrait le texte
   du PDF, puis le LLM en extrait les paramètres utiles (endettement,
   nombre d'engagements, incidents…), et **relance le scoring** en tenant
   compte de ces éléments en plus des autres facteurs — le résultat affiché
   distingue "avec BIC" de la première passe "sans BIC".
4. Si rien n'est inséré : on n'ajoute rien, on ne déduit rien — jamais de
   supposition.

Ça remplace/complète `ExternalChecksPanel.jsx` actuel (qui n'archive qu'un
montant saisi à la main) par un vrai flux **upload PDF → extraction texte →
extraction de paramètres par LLM → re-scoring**.

## 2. Dossier de crédit scanné — upload + extraction + validation

En dehors du formulaire de saisie manuelle, une **deuxième voie** : charger
un scan du dossier de crédit déjà monté sur papier.

Flux proposé :
1. **Upload** d'un PDF (scanné ou natif) dans une nouvelle zone de l'app,
   séparée du formulaire.
2. **Extraction du texte** : bibliothèque classique d'extraction PDF (pas de
   LLM ni de GGUF nécessaire pour cette étape) — `pdfjs-dist`/`pdf-parse`
   pour un PDF avec une vraie couche de texte ; **Tesseract.js (OCR)** si
   c'est une image scannée sans texte sélectionnable (télécharge un petit
   fichier de langue française, pas un modèle GGUF).
3. **Extraction des paramètres** par le LLM local (Mistral 7B, déjà en
   place) : prompt qui demande un **JSON strict** correspondant exactement
   aux champs du contrat de scoring (`chiffre_affaires`, `montant_demande`,
   `duree_mois`, etc. — mêmes noms que `scoring/scoreCreditApplication.mjs`
   pour éviter toute étape de traduction supplémentaire).
4. **Écran de relecture** : le JSON extrait est affiché **dans le
   formulaire habituel**, pré-rempli, avec les champs modifiables — l'agent
   corrige ce qui est faux avant de valider (jamais d'auto-validation
   silencieuse d'une extraction).
5. Une fois validé → le scoring tourne normalement, puis on enchaîne sur le
   BIC facultatif (§1), le RAG, le chat, comme aujourd'hui.

## 3. Entretien enregistré — audio → transcription → extraction

Même logique que le PDF, mais à partir d'un enregistrement audio de
l'entretien avec le membre :
1. **Enregistrer** l'entretien dans l'app (ou importer un fichier audio).
2. **Transcrire** l'audio en texte — nécessite un modèle de transcription
   (cf. §4, aucun modèle de ce type n'est encore dans le projet).
3. **Extraire les paramètres** du texte transcrit avec le même LLM
   (Mistral), même prompt/même format JSON que pour le PDF (§2) — un seul
   pipeline d'extraction, deux sources d'entrée possibles (PDF ou audio).
4. Même écran de relecture/validation avant de lancer le scoring.
5. **Cas combiné** : formulaire + document + audio en même temps, si
   l'agent veut cumuler les sources — les paramètres extraits de chaque
   source se fusionnent avant validation (à définir : qui gagne en cas de
   contradiction — probablement le champ modifié en dernier par l'agent).

## 4. Modèles à télécharger (ce qui manque encore)

| Besoin | Modèle nécessaire ? | Où le mettre |
|---|---|---|
| Extraction de paramètres (PDF ou audio transcrit → JSON) | **Aucun nouveau modèle** — réutilise le Mistral 7B GGUF déjà en place (`llm/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf`) | déjà en place |
| Extraction du texte d'un PDF natif (texte déjà sélectionnable) | Aucun modèle — une bibliothèque JS (`pdfjs-dist`) | intégrée au code, rien à télécharger |
| Extraction du texte d'un PDF scanné (image) | Tesseract.js (OCR) — petit fichier de données de langue (~5-15 Mo), pas un GGUF | téléchargé automatiquement par la lib au premier lancement, ou placé dans `app/public/tesseract/` si on préfère l'embarquer |
| **Transcription audio** (entretien → texte) | **Oui, un vrai modèle à télécharger** : [whisper.cpp](https://github.com/ggml-org/whisper.cpp) + un modèle Whisper au format GGML, depuis [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main). Pour du français correct sans être trop lourd : `ggml-medium-q5_0.bin` (~500 Mo, bon compromis) ou `ggml-large-v3-q5_0.bin` (~1 Go, meilleure qualité) si la machine de démo est assez puissante. | `llm/models/whisper/ggml-medium-q5_0.bin` (nouveau sous-dossier, même logique que `llm/models/` déjà gitignoré) |

Le binaire `whisper-cli`/`whisper-server` de whisper.cpp est séparé de
`llama-server` (mais du même projet `ggml-org`) — précompilé dans ses
[releases GitHub](https://github.com/ggml-org/whisper.cpp/releases), ou
compilable localement comme `llama-server`.

## 5. Explication en langage naturel structurée (après la décision)

Actuellement, `narrative[]` (dans `scoreCreditApplication.mjs`) donne déjà
quelques phrases, et le LLM peut les reformuler à la demande dans le chat.
Ce qui est demandé en plus : **générer automatiquement**, juste après la
décision (pas seulement sur demande dans le chat), un texte structuré et
complet — "pourquoi on a refusé" / "pourquoi on a accordé" — avant même que
l'utilisateur pose une question. Techniquement : un appel LLM systématique
juste après `scoreCreditApplication` (+ garde-fous), avec un prompt qui
force une structure (ex. 1. Facteurs favorables, 2. Facteurs défavorables,
3. Conclusion), toujours avec repli déterministe (`narrative[]` brut) si le
LLM n'est pas disponible — même principe que partout ailleurs dans le
projet.

## 6. Refonte de l'interface

Demande explicite : interface "clean, conviviale, sobre, moderne", dans
l'esprit ChatGPT/Claude, avec bascule mode clair/sombre. `index.html` /
`index-light.html` (les maquettes HTML d'origine) servent de référence de
contenu — pas de copier-coller direct, l'app React actuelle a une structure
de composants différente. **Pas commencé** — l'utilisateur a lui-même dit
"on reviendra là-dessus", donc pas traité dans cette passe.

## 7. Ce qui a été fait pendant ce point (pas seulement du texte)

- **`RegulatoryPanel` (TEG) et `ViabilityPanel` (rentabilité) retirés de
  l'affichage** dans `App.jsx`, sur demande explicite — les moteurs
  (`regulatory/computeTEG.mjs`, `finance/computeViability.mjs`) et les
  composants restent en place, juste plus rendus. Réversible en une ligne.

## 8. Ce qui reste à décider avant de coder

Cinq chantiers distincts, de tailles très différentes (cf. réponse au chat
pour la discussion de priorité) :
1. Explication structurée automatique (petit, réutilise l'existant).
2. BIC facultatif avec bouton "Passer" (petit, modifie `ExternalChecksPanel`).
3. Upload PDF → extraction → relecture → re-scoring (moyen/gros, nouvelle UI + nouveau code).
4. Audio → transcription → extraction (gros, nouveau modèle à télécharger + nouveau pipeline).
5. Refonte visuelle complète (gros, transverse à tout le reste).
