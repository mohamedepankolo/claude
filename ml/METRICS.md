# Baraka Score — métriques du modèle (régression logistique)

- Entraîné sur 2400 dossiers, testé sur 600 (80/20, stratifié)
- ROC-AUC (test) : **0.815**
- Brier score (test, plus bas = mieux calibré) : **0.0926**

## Répartition par décision (sur le jeu de test)

| Décision | Seuil | Dossiers | Taux de défaut observé |
|---|---|---|---|
| Accorder | p(défaut) < 0.08 | 356 | 0.0393 |
| À examiner | 0.08 ≤ p < 0.25 | 171 | 0.1696 |
| Refuser | p(défaut) ≥ 0.25 | 73 | 0.4658 |

## Calibration (jeu de test, en quintiles de probabilité prédite)

Vérifie que la probabilité prédite correspond à la fréquence de défaut réellement observée dans chaque tranche — pas seulement que le modèle discrimine bien (ROC-AUC ci-dessus mesure autre chose : le bon ordre relatif des dossiers, pas l'exactitude de la valeur prédite).

| Tranche (risque croissant) | N | Probabilité moyenne prédite | Taux de défaut observé |
|---|---|---|---|
| 1/5 | 120 | 0.0175 | 0.0083 |
| 2/5 | 120 | 0.0323 | 0.025 |
| 3/5 | 120 | 0.061 | 0.0833 |
| 4/5 | 120 | 0.1152 | 0.175 |
| 5/5 | 120 | 0.3401 | 0.35 |

Graine aléatoire (train/test split + entraînement) : `42`, fixée pour la reproductibilité de cette démonstration — la graine de génération des données synthétiques elles-mêmes relève du processus de Prisca, hors de ce dépôt.

## Coefficients (log-odds, sur variables standardisées)

| Variable | Coefficient | Sens |
|---|---|---|
| taux_endettement | +1.106 | augmente le risque |
| deja_impaye | +0.352 | augmente le risque |
| nb_retards | +0.291 | augmente le risque |
| score_moralite | -0.201 | réduit le risque |
| capacite_caution | -0.172 | réduit le risque |
| secteur_artisanat | -0.125 | réduit le risque |
| zone_rural | +0.115 | augmente le risque |
| anciennete_activite_mois | -0.098 | réduit le risque |
| a_historique | +0.095 | augmente le risque |
| secteur_agriculture | -0.090 | réduit le risque |
| informel | +0.079 | augmente le risque |
| secteur_services | -0.076 | réduit le risque |
| age | -0.038 | réduit le risque |
| nb_credits_anterieurs | -0.030 | réduit le risque |
| secteur_vente_vivres | +0.020 | augmente le risque |
| secteur_quincaillerie_materiaux | +0.019 | augmente le risque |
| personnes_a_charge | -0.013 | réduit le risque |
| a_caution | -0.011 | réduit le risque |

Intercept : -2.483

## Audit d'équité (données complètes, taux de défaut observé vs risque moyen prédit)

| Variable | Valeur | N | Taux de défaut observé | Risque moyen prédit |
|---|---|---|---|---|
| genre | F | 1660 | 0.1283 | 0.1308 |
| genre | M | 1340 | 0.1284 | 0.1185 |
| zone | rural | 1197 | 0.142 | 0.1351 |
| zone | urbain | 1803 | 0.1192 | 0.1188 |
| secteur | agriculture | 150 | 0.0267 | 0.0348 |
| secteur | artisanat | 352 | 0.0398 | 0.0321 |
| secteur | commerce_detail | 1079 | 0.1455 | 0.1433 |
| secteur | quincaillerie_materiaux | 369 | 0.2249 | 0.215 |
| secteur | services | 473 | 0.0275 | 0.0308 |
| secteur | vente_vivres | 577 | 0.1976 | 0.192 |
| informel | 0 | 1415 | 0.1138 | 0.1072 |
| informel | 1 | 1585 | 0.1413 | 0.1415 |

`genre` n'est pas une variable du modèle (exclue sur consigne de Prisca) ; elle n'apparaît ici que pour vérifier l'absence de pénalisation systématique.
