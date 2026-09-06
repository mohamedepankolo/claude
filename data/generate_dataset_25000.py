"""
Baraka Score — génération d'un jeu de données synthétique élargi (25 000 dossiers)

Objectif (demande explicite de l'équipe, suite à une remarque d'un expert
mentor pendant le hackathon) : passer de 3000 à 25 000 dossiers pour
disposer d'un volume statistiquement plus solide, SUR LES MÊMES PARAMÈTRES
ET LA MÊME LOGIQUE que le jeu fourni par Prisca (`data/donnees_completes.csv`) :

1. Les colonnes originales sont reproduites avec les mêmes formules
   (`benefice_activite = chiffre_affaires - charges_activite`, etc.).
2. Les proportions et distributions observées sur les 3000 dossiers de
   Prisca (secteur, zone, genre, historique, caution...) sont reproduites
   du mieux possible — mesurées directement sur le fichier original, PAS
   inventées.
3. **La colonne cible `defaut` est calculée avec le modèle RÉELLEMENT
   entraîné** (`ml/model.json`, mêmes coefficients que
   `scoring/scoreCreditApplication.mjs`) plutôt qu'une règle ad hoc
   réinventée : on calcule p(défaut) avec l'exacte formule de standardisation
   + régression logistique du contrat de scoring, puis on tire `defaut` en
   loi de Bernoulli(p).

Révision (retour d'équipe, 6 sept. 2026) — alignée sur le nouveau modèle
entraîné (cf. ml/train_model.py, même date) et sur des demandes explicites :
- Colonnes retirées (cohérent avec le retrait des variables du modèle) :
  `epargne_mensuelle`, `regularite_epargne`, `participe_tontine`,
  `regularite_tontine`, `couverture_cashflow`. `flux_tresorerie_net` est
  également retiré : il ne servait qu'à calculer `couverture_cashflow`, et
  n'est plus collecté dans le formulaire de l'application (DossierForm.jsx).
- Colonnes renommées : `revenu_activite` -> `benefice_activite`,
  `score_reputation` -> `score_moralite` (vocabulaire des mentors métier).
- `pertinence_saisonniere` -> `pertinence_demande` (le champ porte sur le
  timing de la demande par rapport au cycle de l'activité, pas sur le
  secteur lui-même — source de confusion signalée par l'équipe).
- `type_credit` redessiné à partir des produits RÉELS d'un réseau de
  microfinance au Burkina Faso (RCPB, capture d'écran cif-ao.org transmise
  par l'équipe) plutôt que des catégories abstraites précédentes — cf.
  `TYPES_CREDIT_PAR_SECTEUR` ci-dessous, qui reprend exactement les
  contraintes secteur/type de `app/src/components/DossierForm.jsx` et
  `scoring/applyBusinessGuardrails.mjs` (même mapping dans les trois
  endroits, pour qu'un dossier synthétique ne puisse jamais combiner un
  secteur et un type de crédit incompatibles).
- `montant_demande`, `duree_mois` et `type_credit` sont désormais liés : la
  durée est tirée dans la norme du type de crédit choisi
  (`DUREE_NORMES_PAR_TYPE`, identique à `applyBusinessGuardrails.mjs`).
- `mensualite` est désormais calculée AVEC intérêts (amortissement
  classique, comme `regulatory/computeTEG.mjs`), à partir d'un
  `taux_interet_nominal_pct` simulé par type de crédit — plus une simple
  division montant/durée. Valeurs de taux INDICATIVES (pas validées par
  Prisca), documentées dans `TAUX_INTERET_NOMINAL_PAR_TYPE` ci-dessous. Le
  moteur de scoring en production (`scoring/scoreCreditApplication.mjs`)
  garde volontairement son calcul simplifié sans intérêt (le taux n'est
  souvent pas encore fixé au moment de la demande) — ce changement ne
  concerne QUE ce fichier de données, pas le calcul en direct dans l'appli.
- `type_garantie` est désormais orienté (pas uniquement aléatoire) vers la
  garantie usuelle du type de crédit choisi (`GARANTIE_RECOMMANDEE_PAR_TYPE`,
  identique à `applyBusinessGuardrails.mjs`).

Deuxième fichier généré séparément : une vue "base de données interne" avec
des identités **entièrement fictives**, jointe au fichier business par
`dossier_id`, jamais utilisée pour le scoring (même principe que `genre`).

Seed documentée (contrairement au fichier d'origine de Prisca) :
RANDOM_STATE = 20260906, reproductible.
"""
import json
import numpy as np
import pandas as pd

RANDOM_STATE = 20260906
N = 25000
REFERENCE_DATE = pd.Timestamp("2026-09-06")  # date de référence pour âge / dates d'entretien

rng = np.random.default_rng(RANDOM_STATE)

MODEL = json.load(open("ml/model.json"))

SECTEURS = ["commerce_detail", "vente_vivres", "quincaillerie_materiaux", "services", "artisanat", "agriculture"]
SECTEURS_COMMERCE = ["commerce_detail", "vente_vivres", "quincaillerie_materiaux"]
# Proportions mesurées sur data/donnees_completes.csv (3000 dossiers de Prisca).
SECTEUR_P = np.array([0.359667, 0.192333, 0.123000, 0.157667, 0.117333, 0.050000])
SECTEUR_P = SECTEUR_P / SECTEUR_P.sum()

CHARGES_RATIO_PAR_SECTEUR = {  # charges_activite / chiffre_affaires, moyenne mesurée par secteur
    "agriculture": 0.657, "artisanat": 0.564, "commerce_detail": 0.840,
    "quincaillerie_materiaux": 0.873, "services": 0.323, "vente_vivres": 0.860,
}

# Médiane mesurée par secteur sur les 3000 dossiers, corrigée d'un facteur ~1.26
# (calibré empiriquement) : l'arrondi de montant_demande à des paliers ronds
# (round_montant) pousse systématiquement la médiane finale du ratio recalculé
# au-dessus de la valeur visée — sans cette correction, tous les secteurs
# affichent un taux_endettement ~25-28% trop élevé.
_CORRECTION_ARRONDI = 1.26
TAUX_ENDETTEMENT_MEDIANE_PAR_SECTEUR = {
    s: v / _CORRECTION_ARRONDI for s, v in {
        "agriculture": 0.203, "artisanat": 0.153, "commerce_detail": 0.426,
        "quincaillerie_materiaux": 0.541, "services": 0.105, "vente_vivres": 0.487,
    }.items()
}
TAUX_ENDETTEMENT_SIGMA = 0.44  # calibré empiriquement pour retrouver la moyenne mesurée (~0.40)

PERSONNES_A_CHARGE_VALEURS = list(range(11))
PERSONNES_A_CHARGE_P = np.array([0.052667, 0.144333, 0.216333, 0.231000, 0.175000, 0.096667, 0.043333, 0.026333, 0.010667, 0.003333, 0.000333])
PERSONNES_A_CHARGE_P = PERSONNES_A_CHARGE_P / PERSONNES_A_CHARGE_P.sum()

NB_RETARDS_VALEURS = [0, 1, 2, 3, 4, 5, 6]
NB_RETARDS_P = np.array([0.629, 0.214667, 0.104, 0.043333, 0.006333, 0.002333, 0.000333])
NB_RETARDS_P = NB_RETARDS_P / NB_RETARDS_P.sum()

# ---------------------------------------------------------------------------
# Types de crédit — mêmes catégories et mêmes règles que
# app/src/components/DossierForm.jsx (typesCreditDisponibles) et
# scoring/applyBusinessGuardrails.mjs (DUREE_NORMES_PAR_TYPE,
# GARANTIE_RECOMMANDEE_PAR_TYPE). `None` = pas de restriction de secteur.
# ---------------------------------------------------------------------------
SECTEURS_PAR_TYPE_CREDIT = {
    "credit_agricole": ["agriculture"],
    "credit_commercial": SECTEURS_COMMERCE,
    "credart_artisans": ["artisanat"],
    "cfc_femmes_commercantes": SECTEURS_COMMERCE,  # + genre F, cf. plus bas
    "credit_communautaire": None,
    "credit_jeune": None,  # + âge 18-25, cf. plus bas
    "avance_salaire": None,  # + salarié (employeur_nom), cf. plus bas
    "credit_social": None,  # + salarié
    "btp_marche_public": None,
}
DUREE_NORMES_PAR_TYPE = {
    "credit_agricole": (6, 24), "credit_commercial": (6, 18), "credart_artisans": (6, 24),
    "cfc_femmes_commercantes": (6, 18), "credit_communautaire": (6, 12), "credit_jeune": (6, 24),
    "avance_salaire": (1, 6), "credit_social": (6, 12), "btp_marche_public": (6, 24),
}
GARANTIE_RECOMMANDEE_PAR_TYPE = {
    "avance_salaire": "domiciliation_salaire", "credit_social": "domiciliation_salaire",
    "credit_agricole": "caution_solidaire", "credit_commercial": "materiel",
    "credart_artisans": "materiel", "cfc_femmes_commercantes": "caution_solidaire",
}
# Taux d'intérêt nominal annuel simulé par type de crédit (%) — INDICATIF,
# pas une grille officielle RCPB recopiée (aucune trouvée), juste un ordre de
# grandeur plausible en microfinance ouest-africaine (10-17%/an), pour que
# `mensualite` soit calculée avec un vrai taux plutôt qu'une division plate.
TAUX_INTERET_NOMINAL_PAR_TYPE = {
    "avance_salaire": 10.0, "credit_social": 12.0, "credit_communautaire": 13.0,
    "cfc_femmes_commercantes": 14.0, "credit_jeune": 14.0, "credit_agricole": 15.0,
    "credart_artisans": 15.0, "credit_commercial": 16.0, "btp_marche_public": 17.0,
}


def round_montant(x):
    """Arrondit à une valeur "ronde" plutôt qu'un chiffre arbitraire (ex. 1 319 000 -> 1 300 000),
    palier plus large à mesure que le montant grandit — comme des montants réellement proposés
    à un client, jamais un chiffre au FCFA près."""
    if x < 500_000:
        step = 25_000
    elif x < 2_000_000:
        step = 50_000
    elif x < 10_000_000:
        step = 100_000
    elif x < 50_000_000:
        step = 500_000
    else:
        step = 1_000_000
    return int(max(150_000, min(120_000_000, round(x / step) * step)))


def beta_from_mean_std(mean, std, size):
    var = std ** 2
    s = mean * (1 - mean) / var - 1
    s = max(s, 0.5)
    a = max(mean * s, 0.01)
    b = max(s - a, 0.01)
    return rng.beta(a, b, size)


def monthly_payment(principal, monthly_rate, n):
    """Mensualité d'un prêt amorti à mensualités constantes — même formule que
    regulatory/computeTEG.mjs:monthlyPayment (JS), portée ici en numpy."""
    return np.where(
        monthly_rate == 0, principal / n,
        principal * monthly_rate / (1 - (1 + monthly_rate) ** (-n)),
    )


def present_value(payment, monthly_rate, n):
    """Inverse de monthly_payment : le principal financé par une mensualité donnée."""
    return np.where(monthly_rate == 0, payment * n, payment * (1 - (1 + monthly_rate) ** (-n)) / monthly_rate)


# ---------------------------------------------------------------------------
# 1. Colonnes d'origine
# ---------------------------------------------------------------------------
# Proportions ajustées par rapport au fichier de Prisca (55,3% F / 52,8% informel),
# à la lumière de sources externes sourcées (cf. SOURCES_METHODOLOGIE.md) :
# - genre : les femmes représentent ~65% de la clientèle des IMF en Afrique de
#   l'Ouest (FinDev Gateway / Cairn.info), contre 75% au niveau africain
#   global. 62% retenu ici : compromis documenté entre le fichier d'origine
#   (55,3%) et ce repère régional.
# - informel : l'INSD mesure 93,5% d'emploi informel au niveau national (tous
#   travailleurs, salariés du formel inclus), contre 52,8% dans le fichier de
#   Prisca. 68% retenu ici comme compromis documenté, pas une valeur validée
#   au même titre que les deux bornes citées.
genre = rng.choice(["F", "M"], size=N, p=[0.62, 0.38])
age = np.clip(rng.normal(38.05, 8.81, N), 20, 66).round().astype(int)
zone = rng.choice(["urbain", "rural"], size=N, p=[0.601, 0.399])
secteur = rng.choice(SECTEURS, size=N, p=SECTEUR_P)
informel = rng.choice([1, 0], size=N, p=[0.68, 0.32])
personnes_a_charge = rng.choice(PERSONNES_A_CHARGE_VALEURS, size=N, p=PERSONNES_A_CHARGE_P)

anciennete_shape, anciennete_scale = 3.42, 11.64  # calibré sur moyenne 39.85 / écart-type 21.54 mesurés
anciennete_activite_mois = np.clip(rng.gamma(anciennete_shape, anciennete_scale, N) + 6, 6, 200).round().astype(int)

chiffre_affaires = np.clip(rng.lognormal(np.log(660000), 1.585, N), 90000, 165000000).round(-3).astype(int)
charges_ratio = np.array([CHARGES_RATIO_PAR_SECTEUR[s] for s in secteur])
charges_activite = np.clip(chiffre_affaires * charges_ratio * rng.normal(1.0, 0.08, N), 0, None).round(-3).astype(int)
charges_activite = np.minimum(charges_activite, (chiffre_affaires * 0.98).astype(int))
benefice_activite = chiffre_affaires - charges_activite

charges_perso = np.clip(rng.normal(61444, 26893, N), 20000, 162000).round(-3).astype(int)

# --- Emploi salarié (avant le type de crédit : un salarié peut aussi avoir une activité) ---
est_salarie = rng.random(N) < 0.20

# --- Type de crédit : dépend du secteur, du genre, de l'âge et du statut salarié ---
# Poids indicatifs : les produits directement liés au secteur (agricole,
# commercial, artisanat) sont majoritaires ; le crédit communautaire est un
# recours secondaire disponible partout ; BTP et crédit jeune restent des
# produits de niche (sinon surreprésentés faute de secteur "BTP" dans notre
# nomenclature à 6 secteurs).
POIDS_TYPE_CREDIT = {
    "credit_agricole": 3, "credit_commercial": 3, "credart_artisans": 3,
    "cfc_femmes_commercantes": 2, "avance_salaire": 2, "credit_social": 2,
    "credit_communautaire": 1, "credit_jeune": 0.4, "btp_marche_public": 0.3,
}


def choix_type_credit(sec, g, a, sal):
    options = [
        t for t in TAUX_INTERET_NOMINAL_PAR_TYPE
        if (SECTEURS_PAR_TYPE_CREDIT[t] is None or sec in SECTEURS_PAR_TYPE_CREDIT[t])
        and (t != "cfc_femmes_commercantes" or g == "F")
        and (t != "credit_jeune" or a <= 25)
        and (t not in ("avance_salaire", "credit_social") or sal)
    ]
    poids = np.array([POIDS_TYPE_CREDIT[t] for t in options])
    return rng.choice(options, p=poids / poids.sum())


type_credit = np.array([choix_type_credit(s, g, a, sal) for s, g, a, sal in zip(secteur, genre, age, est_salarie)])

# --- Durée liée au type de crédit (norme usuelle du produit) ---
duree_bornes = np.array([DUREE_NORMES_PAR_TYPE[t] for t in type_credit])
duree_mois = np.array([rng.integers(lo, hi + 1) for lo, hi in duree_bornes])
# Arrondi aux échéances usuelles (mensualités rondes), plutôt qu'un nombre de mois quelconque.
duree_mois = np.array([min([1, 2, 3, 6, 9, 12, 18, 24, 36, 48], key=lambda d: abs(d - x)) for x in duree_mois])
duree_mois = np.clip(duree_mois, duree_bornes[:, 0], duree_bornes[:, 1])

taux_interet_nominal_pct = np.array([TAUX_INTERET_NOMINAL_PAR_TYPE[t] for t in type_credit]) * rng.normal(1.0, 0.05, N)
taux_interet_nominal_pct = np.round(np.clip(taux_interet_nominal_pct, 5, 24), 2)
taux_mensuel = taux_interet_nominal_pct / 100 / 12

taux_mediane = np.array([TAUX_ENDETTEMENT_MEDIANE_PAR_SECTEUR[s] for s in secteur])
taux_endettement_cible = np.clip(rng.lognormal(np.log(taux_mediane), TAUX_ENDETTEMENT_SIGMA, N), 0.02, 3.0)
mensualite_cible = taux_endettement_cible * np.maximum(benefice_activite, 1)
# `montant_demande` déduit de la mensualité cible PAR AMORTISSEMENT (avec
# intérêts), pas d'une simple division — cf. docstring en tête de fichier.
montant_brut = present_value(mensualite_cible, taux_mensuel, duree_mois)
montant_demande = np.array([round_montant(m) for m in montant_brut])
mensualite = monthly_payment(montant_demande, taux_mensuel, duree_mois).round().astype(int)
# `taux_endettement` recalculé après arrondi de `montant_demande`, exactement
# comme le fait le moteur de scoring. Écrêté à 3.0 (borne haute EXACTE
# observée sur les 3000 dossiers de Prisca) : pour les tout petits bénéfices,
# l'arrondi au montant plancher (150 000 FCFA) peut sinon produire un ratio
# disproportionné qu'aucun dossier réel de la base d'origine n'atteint.
taux_endettement = np.clip(mensualite / np.maximum(benefice_activite, 1), 0.02, 3.0)

a_historique = rng.choice([1, 0], size=N, p=[0.596, 0.404])
nb_credits_anterieurs = np.where(a_historique == 1, np.clip(rng.poisson(1.5, N) + 1, 0, 8), 0)
deja_impaye = np.where(a_historique == 1, (rng.random(N) < 0.0884).astype(int), 0)

a_caution = rng.choice([1, 0], size=N, p=[0.628, 0.372])
capacite_caution = np.where(a_caution == 1, beta_from_mean_std(0.504, 0.208, N).round(3), 0.0)

score_moralite = beta_from_mean_std(0.7146, 0.15, N).round(3)
nb_retards = rng.choice(NB_RETARDS_VALEURS, size=N, p=NB_RETARDS_P)

df = pd.DataFrame({
    "genre": genre, "age": age, "zone": zone, "secteur": secteur, "informel": informel,
    "personnes_a_charge": personnes_a_charge, "anciennete_activite_mois": anciennete_activite_mois,
    "chiffre_affaires": chiffre_affaires, "charges_activite": charges_activite,
    "benefice_activite": benefice_activite,
    "charges_perso": charges_perso, "montant_demande": montant_demande, "duree_mois": duree_mois,
    "type_credit": type_credit, "taux_interet_nominal_pct": taux_interet_nominal_pct,
    "mensualite": mensualite, "taux_endettement": taux_endettement.round(4),
    "a_historique": a_historique,
    "nb_credits_anterieurs": nb_credits_anterieurs, "nb_retards": nb_retards,
    "deja_impaye": deja_impaye, "a_caution": a_caution, "capacite_caution": capacite_caution,
    "score_moralite": score_moralite,
})

# ---------------------------------------------------------------------------
# 2. Cible `defaut` — calculée avec le VRAI modèle entraîné (ml/model.json),
#    exactement la même formule que scoring/scoreCreditApplication.mjs.
# ---------------------------------------------------------------------------
mean = np.array(MODEL["mean"])
scale = np.array(MODEL["scale"])
coef = np.array(MODEL["coefficients"])
feature_order = MODEL["feature_order"]

X = np.zeros((N, len(feature_order)))
for j, name in enumerate(feature_order):
    if name == "zone_rural":
        X[:, j] = (df["zone"] == "rural").astype(float)
    elif name.startswith("secteur_"):
        X[:, j] = (df["secteur"] == name[len("secteur_"):]).astype(float)
    else:
        X[:, j] = df[name].astype(float)

logit = MODEL["intercept"] + ((X - mean) / scale) @ coef
p_default = 1 / (1 + np.exp(-logit))
defaut = (rng.random(N) < p_default).astype(int)

retards_share = 0.073 / (0.073 + 0.0553)  # part de "retards" parmi les défauts, mesurée sur les 3000 dossiers
type_probleme = np.where(
    defaut == 0, "aucun",
    np.where(rng.random(N) < retards_share, "retards", "impaye"),
)

df["type_probleme"] = type_probleme
df["defaut"] = defaut

# ---------------------------------------------------------------------------
# 3. Colonnes d'extension — champs réellement présents dans le formulaire
#    aujourd'hui (garde-fous + veille) mais absents du fichier d'origine.
#    Optionnels dans le vrai formulaire -> taux de renseignement réaliste.
# ---------------------------------------------------------------------------
def masquer(valeurs, taux_renseigne):
    """Remplace une fraction des valeurs par NA, comme un champ agent facultatif non toujours rempli."""
    mask = rng.random(len(valeurs)) < taux_renseigne
    out = pd.Series(valeurs, dtype=object)
    out[~mask] = pd.NA
    return out

anciennete_membre_brut = np.where(
    rng.random(N) < 0.3, anciennete_activite_mois,
    (rng.random(N) * anciennete_activite_mois),
).round().astype(int)
df["anciennete_membre_mois"] = masquer(anciennete_membre_brut, 0.70)

endettement_zero = rng.random(N) < 0.70
endettement_brut = np.where(
    endettement_zero, 0,
    (benefice_activite * np.clip(rng.normal(1.0, 0.6, N), 0.1, 3.0)).round(-3)
).astype(int)
df["endettement_externe_declare"] = masquer(endettement_brut, 0.60)

montant_dernier_credit_brut = np.array([
    round_montant(m / rng.uniform(1.2, 3.0)) if h == 1 else 0
    for m, h in zip(montant_demande, a_historique)
])
dernier_credit_mask = (a_historique == 1) & (rng.random(N) < 0.60)
df["montant_dernier_credit"] = pd.Series(np.where(dernier_credit_mask, montant_dernier_credit_brut, pd.NA), dtype=object)

# --- Garantie : orientée vers la garantie usuelle du type de crédit (pas uniquement aléatoire) ---
TYPE_GARANTIE_VALEURS = ["aucune", "caution_solidaire", "materiel", "foncier", "domiciliation_salaire", "vehicule"]
TYPE_GARANTIE_P_DEFAUT_AVEC_CAUTION = np.array([0.20, 0.40, 0.20, 0.12, 0.05, 0.03])
TYPE_GARANTIE_P_DEFAUT_SANS_CAUTION = np.array([0.60, 0.05, 0.18, 0.12, 0.03, 0.02])


def choix_garantie(t_credit, a_caution_):
    recommandee = GARANTIE_RECOMMANDEE_PAR_TYPE.get(t_credit)
    if recommandee is not None and rng.random() < 0.55:
        return recommandee
    p = TYPE_GARANTIE_P_DEFAUT_AVEC_CAUTION if a_caution_ else TYPE_GARANTIE_P_DEFAUT_SANS_CAUTION
    return rng.choice(TYPE_GARANTIE_VALEURS, p=p)


type_garantie_brut = np.array([choix_garantie(t, c) for t, c in zip(type_credit, a_caution)])
df["type_garantie"] = masquer(type_garantie_brut, 0.75)

valeur_garantie_brut = np.where(
    type_garantie_brut == "aucune", 0,
    np.array([round_montant(m * r) for m, r in zip(montant_demande, np.clip(rng.normal(0.75, 0.35, N), 0.15, 2.0))])
)
garantie_mask = (type_garantie_brut != "aucune") & (rng.random(N) < 0.85)
df["valeur_garantie"] = pd.Series(np.where(garantie_mask, valeur_garantie_brut, pd.NA), dtype=object)

PERTINENCE_VALEURS = ["favorable", "neutre", "defavorable"]
PERTINENCE_P = [0.30, 0.55, 0.15]
df["pertinence_demande"] = masquer(rng.choice(PERTINENCE_VALEURS, size=N, p=PERTINENCE_P), 0.50)

croissance_brut = np.clip(rng.normal(8, 25, N), -80, 150).round().astype(int)
df["croissance_ventes_pct"] = masquer(croissance_brut, 0.55)

EMPLOYEURS_FICTIFS = [
    "Fictif Comptoir du Sahel", "Fictif Atelier Bobo Artisans", "Fictif Faso Distribution",
    "Fictif Groupe Wend-Panga", "Fictif Négoce Nakambé", "Fictif Quincaillerie du Plateau",
    "Fictif Coton Faso Services", "Fictif Transport Kadiogo", "Fictif École Privée Sahel",
    "Fictif Clinique Wentenga", "Fictif Boulangerie Faso Or", "Fictif Garage Cascades",
]
employeur_brut = np.array([rng.choice(EMPLOYEURS_FICTIFS) if s else "" for s in est_salarie])
df["employeur_nom"] = pd.Series(np.where(employeur_brut != "", employeur_brut, pd.NA), dtype=object)

df.insert(0, "dossier_id", [f"BRK-2026-{i+1:06d}" for i in range(N)])

COLONNES_ORDRE = [
    "dossier_id", "genre", "age", "zone", "secteur", "informel", "personnes_a_charge",
    "anciennete_activite_mois", "chiffre_affaires", "charges_activite", "benefice_activite",
    "charges_perso", "montant_demande", "duree_mois", "type_credit", "taux_interet_nominal_pct",
    "mensualite", "taux_endettement",
    "a_historique", "nb_credits_anterieurs",
    "nb_retards", "deja_impaye", "a_caution", "capacite_caution", "score_moralite",
    "type_probleme", "defaut",
    "anciennete_membre_mois", "endettement_externe_declare", "montant_dernier_credit",
    "type_garantie", "valeur_garantie", "pertinence_demande",
    "croissance_ventes_pct", "employeur_nom",
]
df = df[COLONNES_ORDRE]
df.to_csv("data/donnees_completes_25000.csv", index=False)

# ---------------------------------------------------------------------------
# 4. Identités fictives (fichier séparé, jamais utilisé pour le scoring)
# ---------------------------------------------------------------------------
PRENOMS_M = ["Issouf", "Boureima", "Adama", "Moussa", "Ousmane", "Ibrahim", "Salif", "Amadou", "Yacouba", "Rasmané", "Seydou", "Abdoulaye", "Karim", "Boukary", "Idrissa", "Sibiri", "Zakaria", "Hamidou", "Drissa", "Paul"]
PRENOMS_F = ["Aïcha", "Fatimata", "Awa", "Mariam", "Salimata", "Rasmata", "Assita", "Kadiatou", "Bintou", "Aminata", "Rihanata", "Zenabou", "Djénéba", "Wendkuni", "Alimata", "Sita", "Habibata", "Nafissatou", "Korotimi", "Clarisse"]
NOMS_FAMILLE = ["Ouédraogo", "Sawadogo", "Kaboré", "Compaoré", "Zongo", "Traoré", "Congo", "Nikiema", "Bamogo", "Kagambega", "Sana", "Zoungrana", "Tapsoba", "Bationo", "Ilboudo", "Somé", "Yaméogo", "Kafando", "Ouattara", "Dabiré"]
VILLES = ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora", "Ouahigouya", "Kaya", "Tenkodogo", "Fada N'Gourma", "Dédougou", "Gaoua", "Dori", "Ziniaré", "Réo", "Manga", "Pouytenga", "Boromo", "Diébougou", "Nouna", "Yako", "Gourcy"]
PREFIXES_TEL = ["70", "71", "72", "74", "75", "76", "77", "78"]

prenoms = np.array([rng.choice(PRENOMS_F if g == "F" else PRENOMS_M) for g in genre])
noms = rng.choice(NOMS_FAMILLE, size=N)
lieux_naissance = rng.choice(VILLES, size=N)

date_naissance = [
    (REFERENCE_DATE - pd.DateOffset(years=int(a)) - pd.Timedelta(days=int(rng.integers(0, 365)))).strftime("%Y-%m-%d")
    for a in age
]
date_entretien = [
    (REFERENCE_DATE - pd.Timedelta(days=int(rng.integers(0, 60)))).strftime("%Y-%m-%d")
    for _ in range(N)
]
numero_cnib = [f"B{rng.integers(10_000_000, 99_999_999)}" for _ in range(N)]
numero_telephone = [f"+226 {rng.choice(PREFIXES_TEL)} {rng.integers(10,99)} {rng.integers(10,99)} {rng.integers(10,99)}" for _ in range(N)]

identites = pd.DataFrame({
    "dossier_id": df["dossier_id"],
    "nom": noms,
    "prenom": prenoms,
    "sexe": genre,
    "date_naissance": date_naissance,
    "lieu_naissance": lieux_naissance,
    "numero_cnib": numero_cnib,
    "numero_telephone": numero_telephone,
    "date_entretien": date_entretien,
})
identites.to_csv("data/identites_fictives_25000.csv", index=False)

print(f"defaut rate: {df['defaut'].mean():.4f}")
print(f"n rows business: {len(df)}, n rows identites: {len(identites)}")
print(df[["montant_demande"]].describe())
print(df["secteur"].value_counts(normalize=True))
print(df["type_credit"].value_counts(normalize=True))
print("secteur/type_credit incoherent combos:", sum(
    1 for s, t in zip(df["secteur"], df["type_credit"])
    if SECTEURS_PAR_TYPE_CREDIT.get(t) is not None and s not in SECTEURS_PAR_TYPE_CREDIT[t]
))
