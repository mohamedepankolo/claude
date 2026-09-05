# Baraka Score — métriques du modèle (régression logistique)

- Entraîné sur 2400 dossiers, testé sur 600 (80/20, stratifié)
- ROC-AUC (test) : **0.830**
- Brier score (test, plus bas = mieux calibré) : **0.0918**

## Répartition par décision (sur le jeu de test)

| Décision | Seuil | Dossiers | Taux de défaut observé |
|---|---|---|---|
| Accorder | p(défaut) < 0.08 | 364 | 0.0412 |
| À examiner | 0.08 ≤ p < 0.25 | 164 | 0.1829 |
| Refuser | p(défaut) ≥ 0.25 | 72 | 0.4444 |

## Coefficients (log-odds, sur variables standardisées)

| Variable | Coefficient | Sens |
|---|---|---|
| taux_endettement | +1.122 | augmente le risque |
| regularite_tontine | -0.691 | réduit le risque |
| deja_impaye | +0.374 | augmente le risque |
| nb_retards | +0.311 | augmente le risque |
| participe_tontine | +0.236 | augmente le risque |
| capacite_caution | -0.232 | réduit le risque |
| regularite_epargne | -0.203 | réduit le risque |
| score_reputation | -0.197 | réduit le risque |
| zone_rural | +0.124 | augmente le risque |
| secteur_artisanat | -0.110 | réduit le risque |
| a_historique | +0.095 | augmente le risque |
| anciennete_activite_mois | -0.094 | réduit le risque |
| secteur_agriculture | -0.093 | réduit le risque |
| epargne_mensuelle | -0.090 | réduit le risque |
| informel | +0.082 | augmente le risque |
| couverture_cashflow | -0.068 | réduit le risque |
| secteur_services | -0.057 | réduit le risque |
| age | -0.047 | réduit le risque |
| nb_credits_anterieurs | -0.038 | réduit le risque |
| secteur_quincaillerie_materiaux | +0.020 | augmente le risque |
| a_caution | +0.018 | augmente le risque |
| personnes_a_charge | +0.014 | augmente le risque |
| secteur_vente_vivres | +0.000 | augmente le risque |

Intercept : -2.595

## Audit d'équité (données complètes, taux de défaut observé vs risque moyen prédit)

| Variable | Valeur | N | Taux de défaut observé | Risque moyen prédit |
|---|---|---|---|---|
| genre | F | 1660 | 0.1283 | 0.1255 |
| genre | M | 1340 | 0.1284 | 0.1241 |
| zone | rural | 1197 | 0.142 | 0.1348 |
| zone | urbain | 1803 | 0.1192 | 0.1183 |
| secteur | agriculture | 150 | 0.0267 | 0.0358 |
| secteur | artisanat | 352 | 0.0398 | 0.0322 |
| secteur | commerce_detail | 1079 | 0.1455 | 0.1425 |
| secteur | quincaillerie_materiaux | 369 | 0.2249 | 0.2143 |
| secteur | services | 473 | 0.0275 | 0.0313 |
| secteur | vente_vivres | 577 | 0.1976 | 0.1912 |
| informel | 0 | 1415 | 0.1138 | 0.1071 |
| informel | 1 | 1585 | 0.1413 | 0.1408 |

`genre` n'est pas une variable du modèle (exclue sur consigne de Prisca) ; elle n'apparaît ici que pour vérifier l'absence de pénalisation systématique.
