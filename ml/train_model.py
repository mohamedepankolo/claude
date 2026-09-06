"""
Baraka Score — entraînement du moteur de scoring (régression logistique)

Entrée : data/donnees_completes.csv (3000 dossiers synthétiques, validés par
Prisca — cf. data/GUIDE_LECTURE_DONNEES.md). Cible : `defaut` (1 = impayé ou
retards graves, 0 = remboursé correctement ; ~13% de la base).

Choix de modélisation :
- `genre` est explicitement exclu des variables du modèle (le lexique de
  Prisca le marque "audit d'équité uniquement, PAS dans le score"). On
  l'utilise uniquement pour l'audit d'équité, avec `zone`, `secteur` et
  `informel`.
- On modélise sur des RATIOS et indicateurs métier plutôt que sur les
  montants bruts (chiffre_affaires, montant_demande...) : `taux_endettement`
  encode déjà la capacité de remboursement de façon comparable d'un dossier
  à l'autre, et évite qu'un modèle linéaire apprenne un simple effet
  d'échelle sur les FCFA plutôt qu'un vrai raisonnement de risque. Les
  montants bruts restent utilisés tels quels pour le calcul du montant
  soutenable (formule déterministe, pas modélisée).
- Régression logistique (scikit-learn, standardisation + L2) : interprétable,
  auditable, cohérente avec "modèle interprétable" mis en avant dans la note
  de présentation de l'équipe.

Révision (retour d'équipe, 6 sept. 2026) — variables retirées et renommées :
- `couverture_cashflow`, `epargne_mensuelle`, `regularite_epargne`,
  `participe_tontine`, `regularite_tontine` : retirées des variables du
  modèle (poids jugés peu déterminants et/ou redondants avec
  `taux_endettement`, décision d'équipe). Le fichier source de Prisca
  (`data/donnees_completes.csv`) garde ces colonnes intactes — elles sont
  simplement ignorées à l'entraînement (`COLONNES_RETIREES` ci-dessous),
  jamais supprimées de la donnée d'origine.
- `score_reputation` renommé `score_moralite` pour coller au vocabulaire
  employé par les mentors métier — même variable, même valeur, nom
  différent (`COLONNES_RENOMMEES`).

Sortie : ml/model.json (coefficients + normalisation + seuils), consommé par
scoring/scoreCreditApplication.mjs (aucune dépendance Python nécessaire à
l'inférence : uniquement de l'algèbre linéaire portée en JS).
"""
import json
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, brier_score_loss, confusion_matrix, classification_report

RANDOM_STATE = 42
DATA_PATH = "data/donnees_completes.csv"
OUT_PATH = "ml/model.json"
REPORT_PATH = "ml/METRICS.md"

SECTEURS = ["commerce_detail", "vente_vivres", "quincaillerie_materiaux", "services", "artisanat", "agriculture"]
REFERENCE_SECTEUR = "commerce_detail"  # catégorie de référence (absorbée dans l'intercept)

# Renommage/retrait appliqués UNIQUEMENT à l'entraînement — le fichier source
# de Prisca n'est jamais modifié (cf. docstring ci-dessus).
COLONNES_RENOMMEES = {"score_reputation": "score_moralite"}
COLONNES_RETIREES = ["couverture_cashflow", "epargne_mensuelle", "regularite_epargne", "participe_tontine", "regularite_tontine"]

NUMERIC_FEATURES = [
    "age", "personnes_a_charge", "anciennete_activite_mois",
    "taux_endettement",
    "a_historique", "nb_credits_anterieurs", "nb_retards", "deja_impaye",
    "a_caution", "capacite_caution", "score_moralite",
    "informel",
]


def build_feature_frame(df):
    X = df[NUMERIC_FEATURES].copy()
    X["zone_rural"] = (df["zone"] == "rural").astype(int)
    for s in SECTEURS:
        if s == REFERENCE_SECTEUR:
            continue
        X[f"secteur_{s}"] = (df["secteur"] == s).astype(int)
    return X


def main():
    df = pd.read_csv(DATA_PATH)
    df = df.rename(columns=COLONNES_RENOMMEES).drop(columns=COLONNES_RETIREES)
    y = df["defaut"].astype(int)
    X = build_feature_frame(df)
    feature_names = list(X.columns)

    X_train, X_test, y_train, y_test, df_train, df_test = train_test_split(
        X, y, df, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    model = LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)
    model.fit(X_train_s, y_train)

    proba_test = model.predict_proba(X_test_s)[:, 1]
    auc = roc_auc_score(y_test, proba_test)
    brier = brier_score_loss(y_test, proba_test)

    # Seuils métier : calés sur les quantiles de risque observés dans le test,
    # ajustés pour que "accorder" corresponde à un risque de défaut mesuré bas
    # et "refuser" à un risque mesuré élevé.
    thr_approve, thr_reject = 0.08, 0.25
    bucket = np.where(proba_test < thr_approve, "approve", np.where(proba_test < thr_reject, "review", "reject"))
    bucket_report = {}
    for b in ["approve", "review", "reject"]:
        mask = bucket == b
        bucket_report[b] = {
            "n": int(mask.sum()),
            "taux_defaut_observe": round(float(y_test[mask].mean()), 4) if mask.sum() else None,
        }

    # Calibration (Lory, Architecture Rev.2 section 4 : "Examiner si les
    # probabilités correspondent aux fréquences simulées") — sur le jeu de
    # test uniquement, en quintiles de probabilité prédite. Une bonne
    # calibration signifie que, dans chaque tranche, le taux de défaut
    # réellement observé est proche de la probabilité moyenne prédite.
    n_bins = 5
    order = np.argsort(proba_test)
    bins = np.array_split(order, n_bins)
    calibration_rows = []
    for i, idx in enumerate(bins):
        calibration_rows.append({
            "tranche": i + 1,
            "n": int(len(idx)),
            "p_moyenne_predite": round(float(proba_test[idx].mean()), 4),
            "taux_defaut_observe": round(float(y_test.iloc[idx].mean()), 4),
        })

    proba_full = model.predict_proba(scaler.transform(X))[:, 1]
    equity_rows = []
    for col in ["genre", "zone", "secteur", "informel"]:
        for val, sub in df.groupby(col):
            idx = sub.index
            equity_rows.append({
                "variable": col,
                "valeur": str(val),
                "n": int(len(sub)),
                "taux_defaut_observe": round(float(y.loc[idx].mean()), 4),
                "risque_moyen_predit": round(float(proba_full[idx].mean()), 4),
            })

    coefficients = {name: float(c) for name, c in zip(feature_names, model.coef_[0])}
    model_json = {
        "version": 1,
        "trained_on": DATA_PATH,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "feature_order": feature_names,
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coefficients": [float(c) for c in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "reference_secteur": REFERENCE_SECTEUR,
        "secteurs": SECTEURS,
        "thresholds": {"approve_below": thr_approve, "reject_above": thr_reject},
        "metrics": {"roc_auc": round(float(auc), 4), "brier_score": round(float(brier), 4)},
        # Traçabilité (Lory, Architecture Rev.2 section 4 : "conserver une
        # graine de génération, une version du jeu et une version du modèle
        # pour reproduire la démonstration"). La graine de génération des
        # données synthétiques elle-même appartient au processus de Prisca,
        # hors de ce dépôt ; ce qui suit trace la partie qu'on contrôle.
        "random_state": RANDOM_STATE,
        "data_file": DATA_PATH,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(model_json, f, ensure_ascii=False, indent=2)

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("# Baraka Score — métriques du modèle (régression logistique)\n\n")
        f.write(f"- Entraîné sur {len(X_train)} dossiers, testé sur {len(X_test)} (80/20, stratifié)\n")
        f.write(f"- ROC-AUC (test) : **{auc:.3f}**\n")
        f.write(f"- Brier score (test, plus bas = mieux calibré) : **{brier:.4f}**\n\n")
        f.write("## Répartition par décision (sur le jeu de test)\n\n")
        f.write("| Décision | Seuil | Dossiers | Taux de défaut observé |\n|---|---|---|---|\n")
        f.write(f"| Accorder | p(défaut) < {thr_approve} | {bucket_report['approve']['n']} | {bucket_report['approve']['taux_defaut_observe']} |\n")
        f.write(f"| À examiner | {thr_approve} ≤ p < {thr_reject} | {bucket_report['review']['n']} | {bucket_report['review']['taux_defaut_observe']} |\n")
        f.write(f"| Refuser | p(défaut) ≥ {thr_reject} | {bucket_report['reject']['n']} | {bucket_report['reject']['taux_defaut_observe']} |\n\n")
        f.write("## Calibration (jeu de test, en quintiles de probabilité prédite)\n\n")
        f.write("Vérifie que la probabilité prédite correspond à la fréquence de défaut réellement observée "
                "dans chaque tranche — pas seulement que le modèle discrimine bien (ROC-AUC ci-dessus mesure "
                "autre chose : le bon ordre relatif des dossiers, pas l'exactitude de la valeur prédite).\n\n")
        f.write("| Tranche (risque croissant) | N | Probabilité moyenne prédite | Taux de défaut observé |\n|---|---|---|---|\n")
        for r in calibration_rows:
            f.write(f"| {r['tranche']}/{n_bins} | {r['n']} | {r['p_moyenne_predite']} | {r['taux_defaut_observe']} |\n")
        f.write("\n")
        f.write(f"Graine aléatoire (train/test split + entraînement) : `{RANDOM_STATE}`, fixée pour la reproductibilité de cette démonstration — "
                "la graine de génération des données synthétiques elles-mêmes relève du processus de Prisca, hors de ce dépôt.\n\n")
        f.write("## Coefficients (log-odds, sur variables standardisées)\n\n")
        f.write("| Variable | Coefficient | Sens |\n|---|---|---|\n")
        for name, c in sorted(coefficients.items(), key=lambda kv: -abs(kv[1])):
            sens = "augmente le risque" if c > 0 else "réduit le risque"
            f.write(f"| {name} | {c:+.3f} | {sens} |\n")
        f.write(f"\nIntercept : {model.intercept_[0]:+.3f}\n\n")
        f.write("## Audit d'équité (données complètes, taux de défaut observé vs risque moyen prédit)\n\n")
        f.write("| Variable | Valeur | N | Taux de défaut observé | Risque moyen prédit |\n|---|---|---|---|---|\n")
        for r in equity_rows:
            f.write(f"| {r['variable']} | {r['valeur']} | {r['n']} | {r['taux_defaut_observe']} | {r['risque_moyen_predit']} |\n")
        f.write("\n`genre` n'est pas une variable du modèle (exclue sur consigne de Prisca) ; "
                "elle n'apparaît ici que pour vérifier l'absence de pénalisation systématique.\n")

    print(f"ROC-AUC={auc:.3f}  Brier={brier:.4f}")
    print(json.dumps(bucket_report, indent=2, ensure_ascii=False))
    print("\n-- classification_report (seuil 0.5, indicatif) --")
    print(classification_report(y_test, (proba_test >= 0.5).astype(int)))
    print(f"\nWrote {OUT_PATH} and {REPORT_PATH}")


if __name__ == "__main__":
    main()
