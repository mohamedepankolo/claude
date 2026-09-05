# LLM local — Mistral 7B Instruct (GGUF)

Utilisé pour deux choses, toutes les deux **optionnelles** (l'app fonctionne
sans, avec un texte de repli déterministe — cf. "Plan B" de Lory : *"si le
modèle complet tombe, utiliser un modèle de secours prévalidé, ne jamais
inventer un résultat"*) :

1. Reformuler l'explication du score en langage plus naturel/fluide.
2. Répondre aux questions libres du chatbox sur un dossier ("qu'aurait-il
   fallu pour l'accorder ?", "et si le CA augmentait de 20% ?"...).

## Pourquoi un serveur local plutôt qu'un binding Node

`node-llama-cpp` (binding natif) est une option, mais ses binaires prébuilts
ne couvrent pas forcément toutes les machines de l'équipe le jour J. On
préfère **`llama-server`** (fourni par [llama.cpp](https://github.com/ggml-org/llama.cpp)),
qui expose une API HTTP compatible OpenAI sur `localhost` — l'app React
l'appelle en `fetch()`, sans dépendance native à compiler, et ça marche pareil
sous Windows/Mac/Linux.

## Mise en route (à faire sur la machine qui fait la démo)

1. Récupérer `llama-server` (binaire précompilé dans les
   [releases de llama.cpp](https://github.com/ggml-org/llama.cpp/releases),
   ou compilé localement).
2. Placer le modèle ici : `llm/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf`
   (le dossier `models/` est ignoré par git — fichier de plusieurs Go, ne se
   commite pas).
3. Démarrer le serveur :
   ```bash
   llama-server -m llm/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf \
     --port 8090 -c 4096 --host 127.0.0.1
   ```
4. L'app (`app/.env.local`, voir `app/.env.example`) pointe déjà vers
   `http://127.0.0.1:8090` par défaut — rien à changer si vous gardez ce port.

## Si le serveur n'est pas démarré / le modèle est absent

`app/src/llm/llmClient.js` fait un health-check avant chaque appel et
retombe automatiquement sur les réponses générées par les règles
(`scoring/scoreCreditApplication.mjs`, champ `narrative`, et un petit
répondeur local pour le chat). L'interface ne plante jamais et n'invente
jamais un chiffre qui ne vient pas du dossier.
