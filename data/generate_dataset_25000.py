"""
Baraka Score — génération d'un jeu de données synthétique élargi (25 000 dossiers)

Objectif (demande explicite de l'équipe, suite à une remarque d'un expert
mentor pendant le hackathon) : passer de 3000 à 25 000 dossiers pour
disposer d'un volume statistiquement plus solide, SUR LES MÊMES PARAMÈTRES
ET LA MÊME LOGIQUE que le jeu fourni par Prisca (`data/donnees_completes.csv`) :

1. Les 30 colonnes originales sont reproduites à l'identique (mêmes noms,
   mêmes unités, mêmes formules pour les colonnes calculées : `revenu_activite
   = chiffre_affaires - charges_activite`, `mensualite = montant_demande /
   duree_mois`, etc.).
2. Les proportions et distributions observées sur les 3000 dossiers de
   Prisca (secteur, zone, genre, historique, tontine, caution...) sont
   reproduites du mieux possible — mesurées directement sur le fichier
   original ci-dessous (`python3 -c "import pandas..."`, résultats collés
   en commentaire), PAS inventées.
3. **La colonne cible `defaut` est calculée avec le modèle RÉELLEMENT
   entraîné** (`ml/model.json`, mêmes coefficients que
   `scoring/scoreCreditApplication.mjs`) plutôt qu'une règle ad hoc
   réinventée : on calcule p(défaut) avec l'exacte formule de standardisation
   + régression logistique du contrat de scoring, puis on tire `defaut` en
   loi de Bernoulli(p). C'est la façon la plus honnête de garantir "mêmes
   paramètres, même logique" : c'est littéralement le même modèle qui étiquette.
   Conséquence assumée : ce fichier ne peut PAS servir à "révéler" un
   meilleur modèle par construction (il est généré par le modèle actuel) ;
   il sert à démontrer le passage à l'échelle et à ré-entraîner sur un
   volume plus robuste (mêmes coefficients attendus, erreurs-types plus
   petites) — décision de ré-entraînement laissée à l'équipe, cf. data/README.md.

Extension par rapport au fichier de Prisca — ajout des colonnes qui
correspondent aux champs RÉELLEMENT saisis dans le formulaire de
l'application aujourd'hui (garde-fous métier + veille), mais qui
n'existaient pas dans le fichier d'origine (construit avant ces
fonctionnalités) : `anciennete_membre_mois`, `endettement_externe_declare`,
`montant_dernier_credit`, `type_credit`, `type_garantie`, `valeur_garantie`,
`pertinence_saisonniere`, `croissance_ventes_pct`, `employeur_nom`. Champs
optionnels dans le vrai formulaire (l'agent ne les renseigne pas toujours) :
laissés vides ici avec un taux de renseignement réaliste, jamais à 100%.

Deuxième fichier généré séparément : une vue "base de données interne"
avec des identités **entièrement fictives** (nom, prénom, sexe, date et
lieu de naissance, numéro CNIB, numéro de téléphone, date d'entretien),
pour donner à la démo la structure d'une vraie base cliente — jointe au
fichier business par `dossier_id`, jamais fusionnée avec les colonnes
d'entraînement (même principe que `genre`, exclu du scoring : l'identité
n'entre jamais dans le modèle). AUCUN nom, numéro CNIB ou numéro de
téléphone réel : combinaisons aléatoires de prénoms/noms de famille et de
villes courants au Burkina Faso, numéro CNIB de format illustratif (pas
le vrai schéma officiel), numéro de téléphone au format burkinabè mais
tiré au hasard (même principe que les numéros "555" factices utilisés
partout dans les jeux de test/démo).

Seed documentée (contrairement au fichier d'origine de Prisca, dont la
graine et la méthode de génération ne sont pas connues, cf. data/README.md
"Points encore à confirmer") : RANDOM_STATE = 20260906, reproductible.
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
# Proportions mesurées sur data/donnees_completes.csv (3000 dossiers de Prisca).
SECTEUR_P = np.array([0.359667, 0.192333, 0.123000, 0.157667, 0.117333, 0.050000])
SECTEUR_P = SECTEUR_P / SECTEUR_P.sum()

CHARGES_RATIO_PAR_SECTEUR = {  # charges_activite / chiffre_affaires, moyenne mesurée par secteur
    "agriculture": 0.657, "artisanat": 0.564, "commerce_detail": 0.840,
    "quincaillerie_materiaux": 0.873, "services": 0.323, "vente_vivres": 0.860,
}
# `montant_demande` n'est PAS tiré indépendamment de `revenu_activite` : sur
# les 3000 dossiers de Prisca, corrélation log-log de 0.83 entre les deux
# (un gros dossier a un gros CA ET un gros crédit). On tire donc directement
# `taux_endettement` (le vrai levier du modèle entraîné, coefficient de très
# loin le plus élevé) par secteur, et on EN DÉDUIT montant_demande =
# taux_endettement x revenu_activite x duree_mois — ce qui reproduit la
# corrélation observée sans avoir à la forcer artificiellement.
# Médiane mesurée par secteur sur les 3000 dossiers, corrigée d'un facteur ~1.26
# (calibré empiriquement) : l'arrondi de montant_demande à des paliers ronds
# (round_montant) et son plancher à 150 000 FCFA poussent systématiquement la
# médiane finale du ratio recalculé au-dessus de la valeur visée — sans cette
# correction, tous les secteurs affichent un taux_endettement ~25-28% trop élevé.
_CORRECTION_ARRONDI = 1.26
TAUX_ENDETTEMENT_MEDIANE_PAR_SECTEUR = {
    s: v / _CORRECTION_ARRONDI for s, v in {
        "agriculture": 0.203, "artisanat": 0.153, "commerce_detail": 0.426,
        "quincaillerie_materiaux": 0.541, "services": 0.105, "vente_vivres": 0.487,
    }.items()
}
TAUX_ENDETTEMENT_SIGMA = 0.44  # réduit par rapport à l'estimation initiale (0.79, quantiles p5/p95) :
# la moyenne d'une loi log-normale croît avec sigma (mean = médiane x exp(sigma²/2)) ; 0.79 donnait
# une moyenne ~40% trop haute une fois combinée à l'arrondi de montant_demande. Calibré empiriquement
# pour retrouver la moyenne mesurée (~0.40) tout en gardant la médiane exacte par secteur.
COUVERTURE_CASHFLOW_MEDIANE = 2.7775  # médiane mesurée (global, coefficient du modèle très faible : pas de détail par secteur)
COUVERTURE_CASHFLOW_SIGMA = 0.795

DUREE_VALEURS = [12, 18, 9, 24, 6]
DUREE_P = [0.702667, 0.114333, 0.065333, 0.061333, 0.056333]
DUREE_P = np.array(DUREE_P) / sum(DUREE_P)

PERSONNES_A_CHARGE_VALEURS = list(range(11))
PERSONNES_A_CHARGE_P = np.array([0.052667, 0.144333, 0.216333, 0.231000, 0.175000, 0.096667, 0.043333, 0.026333, 0.010667, 0.003333, 0.000333])
PERSONNES_A_CHARGE_P = PERSONNES_A_CHARGE_P / PERSONNES_A_CHARGE_P.sum()

NB_RETARDS_VALEURS = [0, 1, 2, 3, 4, 5, 6]
NB_RETARDS_P = np.array([0.629, 0.214667, 0.104, 0.043333, 0.006333, 0.002333, 0.000333])
NB_RETARDS_P = NB_RETARDS_P / NB_RETARDS_P.sum()


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


# ---------------------------------------------------------------------------
# 1. Colonnes d'origine (mêmes 30 colonnes que data/donnees_completes.csv)
# ---------------------------------------------------------------------------
genre = rng.choice(["F", "M"], size=N, p=[0.553333, 0.446667])
age = np.clip(rng.normal(38.05, 8.81, N), 20, 66).round().astype(int)
zone = rng.choice(["urbain", "rural"], size=N, p=[0.601, 0.399])
secteur = rng.choice(SECTEURS, size=N, p=SECTEUR_P)
informel = rng.choice([1, 0], size=N, p=[0.528333, 0.471667])
personnes_a_charge = rng.choice(PERSONNES_A_CHARGE_VALEURS, size=N, p=PERSONNES_A_CHARGE_P)

anciennete_shape, anciennete_scale = 3.42, 11.64  # calibré sur moyenne 39.85 / écart-type 21.54 mesurés
anciennete_activite_mois = np.clip(rng.gamma(anciennete_shape, anciennete_scale, N) + 6, 6, 200).round().astype(int)

chiffre_affaires = np.clip(rng.lognormal(np.log(660000), 1.585, N), 90000, 165000000).round(-3).astype(int)
charges_ratio = np.array([CHARGES_RATIO_PAR_SECTEUR[s] for s in secteur])
charges_activite = np.clip(chiffre_affaires * charges_ratio * rng.normal(1.0, 0.08, N), 0, None).round(-3).astype(int)
charges_activite = np.minimum(charges_activite, (chiffre_affaires * 0.98).astype(int))
revenu_activite = chiffre_affaires - charges_activite

charges_perso = np.clip(rng.normal(61444, 26893, N), 20000, 162000).round(-3).astype(int)

duree_mois = rng.choice(DUREE_VALEURS, size=N, p=DUREE_P)

taux_mediane = np.array([TAUX_ENDETTEMENT_MEDIANE_PAR_SECTEUR[s] for s in secteur])
taux_endettement_cible = np.clip(rng.lognormal(np.log(taux_mediane), TAUX_ENDETTEMENT_SIGMA, N), 0.02, 3.0)
mensualite_brute = taux_endettement_cible * np.maximum(revenu_activite, 1)
montant_demande = np.array([round_montant(m * d) for m, d in zip(mensualite_brute, duree_mois)])
mensualite = (montant_demande / duree_mois).round().astype(int)
# `taux_endettement` final recalculé après arrondi de `montant_demande`, exactement
# comme le fait le moteur de scoring (scoring/scoreCreditApplication.mjs). Écrêté à
# 3.0 (borne haute EXACTE observée sur les 3000 dossiers de Prisca) : pour les tout
# petits bénéfices, l'arrondi au montant plancher (150 000 FCFA, cf. round_montant)
# peut sinon produire un ratio disproportionné qu'aucun dossier réel de la base
# d'origine n'atteint — simplification assumée, documentée dans data/README.md.
taux_endettement = np.clip(mensualite / np.maximum(revenu_activite, 1), 0.02, 3.0)

couverture_cashflow_cible = np.clip(rng.lognormal(np.log(COUVERTURE_CASHFLOW_MEDIANE), COUVERTURE_CASHFLOW_SIGMA, N), 0.2, 46.4)
flux_tresorerie_net = (couverture_cashflow_cible * mensualite).round().astype(int)
couverture_cashflow = np.clip(flux_tresorerie_net / np.maximum(mensualite, 1), 0.2, 46.4)

epargne_zero = rng.random(N) < 0.15
epargne_mensuelle = np.where(
    epargne_zero, 0,
    np.clip(rng.lognormal(np.log(15000), 1.3, N), 1000, 9000000)
).round(-3).astype(int)
regularite_epargne = beta_from_mean_std(0.5536, 0.28, N).round(3)

participe_tontine = rng.choice([1, 0], size=N, p=[0.526, 0.474])
regularite_tontine = np.where(participe_tontine == 1, beta_from_mean_std(0.658, 0.24, N).round(3), 0.0)

a_historique = rng.choice([1, 0], size=N, p=[0.596, 0.404])
nb_credits_anterieurs = np.where(a_historique == 1, np.clip(rng.poisson(1.5, N) + 1, 0, 8), 0)
deja_impaye = np.where(a_historique == 1, (rng.random(N) < 0.0884).astype(int), 0)

a_caution = rng.choice([1, 0], size=N, p=[0.628, 0.372])
capacite_caution = np.where(a_caution == 1, beta_from_mean_std(0.504, 0.208, N).round(3), 0.0)

score_reputation = beta_from_mean_std(0.7146, 0.15, N).round(3)
nb_retards = rng.choice(NB_RETARDS_VALEURS, size=N, p=NB_RETARDS_P)

df = pd.DataFrame({
    "genre": genre, "age": age, "zone": zone, "secteur": secteur, "informel": informel,
    "personnes_a_charge": personnes_a_charge, "anciennete_activite_mois": anciennete_activite_mois,
    "chiffre_affaires": chiffre_affaires, "charges_activite": charges_activite,
    "revenu_activite": revenu_activite, "flux_tresorerie_net": flux_tresorerie_net,
    "charges_perso": charges_perso, "montant_demande": montant_demande, "duree_mois": duree_mois,
    "mensualite": mensualite, "taux_endettement": taux_endettement.round(4),
    "couverture_cashflow": couverture_cashflow.round(4), "epargne_mensuelle": epargne_mensuelle,
    "regularite_epargne": regularite_epargne, "participe_tontine": participe_tontine,
    "regularite_tontine": regularite_tontine, "a_historique": a_historique,
    "nb_credits_anterieurs": nb_credits_anterieurs, "nb_retards": nb_retards,
    "deja_impaye": deja_impaye, "a_caution": a_caution, "capacite_caution": capacite_caution,
    "score_reputation": score_reputation,
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
    (revenu_activite * np.clip(rng.normal(1.0, 0.6, N), 0.1, 3.0)).round(-3)
).astype(int)
df["endettement_externe_declare"] = masquer(endettement_brut, 0.60)

montant_dernier_credit_brut = np.array([
    round_montant(m / rng.uniform(1.2, 3.0)) if h == 1 else 0
    for m, h in zip(montant_demande, a_historique)
])
dernier_credit_mask = (a_historique == 1) & (rng.random(N) < 0.60)
df["montant_dernier_credit"] = pd.Series(np.where(dernier_credit_mask, montant_dernier_credit_brut, pd.NA), dtype=object)

TYPE_CREDIT_VALEURS = ["productif_fonds_roulement", "productif_equipement", "salarie_scolaire", "salarie_autre", "agricole", "productif_immobilier", "btp_marche_public"]
TYPE_CREDIT_P = np.array([0.42, 0.15, 0.10, 0.10, 0.10, 0.08, 0.05])
TYPE_CREDIT_P = TYPE_CREDIT_P / TYPE_CREDIT_P.sum()
type_credit_brut = rng.choice(TYPE_CREDIT_VALEURS, size=N, p=TYPE_CREDIT_P)
type_credit_brut = np.where(secteur == "agriculture", "agricole", type_credit_brut)
df["type_credit"] = masquer(type_credit_brut, 0.90)

TYPE_GARANTIE_VALEURS = ["aucune", "caution_solidaire", "materiel", "foncier", "domiciliation_salaire", "vehicule"]
TYPE_GARANTIE_P_AVEC_CAUTION = np.array([0.20, 0.40, 0.20, 0.12, 0.05, 0.03])
TYPE_GARANTIE_P_SANS_CAUTION = np.array([0.60, 0.05, 0.18, 0.12, 0.03, 0.02])
type_garantie_brut = np.array([
    rng.choice(TYPE_GARANTIE_VALEURS, p=TYPE_GARANTIE_P_AVEC_CAUTION if c else TYPE_GARANTIE_P_SANS_CAUTION)
    for c in a_caution
])
df["type_garantie"] = masquer(type_garantie_brut, 0.75)

valeur_garantie_brut = np.where(
    type_garantie_brut == "aucune", 0,
    np.array([round_montant(m * r) for m, r in zip(montant_demande, np.clip(rng.normal(0.75, 0.35, N), 0.15, 2.0))])
)
garantie_mask = (type_garantie_brut != "aucune") & (rng.random(N) < 0.85)
df["valeur_garantie"] = pd.Series(np.where(garantie_mask, valeur_garantie_brut, pd.NA), dtype=object)

PERTINENCE_VALEURS = ["favorable", "neutre", "defavorable"]
PERTINENCE_P = [0.30, 0.55, 0.15]
df["pertinence_saisonniere"] = masquer(rng.choice(PERTINENCE_VALEURS, size=N, p=PERTINENCE_P), 0.50)

croissance_brut = np.clip(rng.normal(8, 25, N), -80, 150).round().astype(int)
df["croissance_ventes_pct"] = masquer(croissance_brut, 0.55)

EMPLOYEURS_FICTIFS = [
    "Fictif Comptoir du Sahel", "Fictif Atelier Bobo Artisans", "Fictif Faso Distribution",
    "Fictif Groupe Wend-Panga", "Fictif Négoce Nakambé", "Fictif Quincaillerie du Plateau",
    "Fictif Coton Faso Services", "Fictif Transport Kadiogo", "Fictif École Privée Sahel",
    "Fictif Clinique Wentenga", "Fictif Boulangerie Faso Or", "Fictif Garage Cascades",
]
est_salarie = np.isin(type_credit_brut, ["salarie_scolaire", "salarie_autre"]) | ((informel == 0) & (rng.random(N) < 0.25))
employeur_brut = np.array([rng.choice(EMPLOYEURS_FICTIFS) if s else "" for s in est_salarie])
df["employeur_nom"] = pd.Series(np.where(employeur_brut != "", employeur_brut, pd.NA), dtype=object)

df.insert(0, "dossier_id", [f"BRK-2026-{i+1:06d}" for i in range(N)])

COLONNES_ORDRE = [
    "dossier_id", "genre", "age", "zone", "secteur", "informel", "personnes_a_charge",
    "anciennete_activite_mois", "chiffre_affaires", "charges_activite", "revenu_activite",
    "flux_tresorerie_net", "charges_perso", "montant_demande", "duree_mois", "mensualite",
    "taux_endettement", "couverture_cashflow", "epargne_mensuelle", "regularite_epargne",
    "participe_tontine", "regularite_tontine", "a_historique", "nb_credits_anterieurs",
    "nb_retards", "deja_impaye", "a_caution", "capacite_caution", "score_reputation",
    "type_probleme", "defaut",
    "anciennete_membre_mois", "endettement_externe_declare", "montant_dernier_credit",
    "type_credit", "type_garantie", "valeur_garantie", "pertinence_saisonniere",
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
