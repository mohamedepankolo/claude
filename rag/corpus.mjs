/**
 * Baraka Score — corpus RAG (MVP minimal et fiable, cf. architecture de Lory
 * section 6 : "ne cherchez pas à ingérer toute la réglementation").
 *
 * Trois documents contrôlés, volontairement courts :
 *  - `teg-methode-calcul` : documentation réelle de notre propre méthode de
 *    calcul (@regulatory/computeTEG.mjs) — pas une source externe, mais un
 *    contenu honnête sur ce que le moteur fait réellement.
 *  - `taux-usure-sfd-bceao-2026` : le taux (24%) et sa date d'entrée en
 *    vigueur (01/06/2026) sont RÉELS et sourcés (BCEAO, Décision
 *    n°19/29-12-2025/CM/UMOA — cf. SOURCES_METHODOLOGIE.md, section
 *    réglementaire) ; on ne recopie en revanche jamais le TEXTE légal
 *    complet de la décision (les conditions d'application détaillées,
 *    exclusions de coût, sanctions...) — seulement le fait et sa source,
 *    jamais de contenu juridique fabriqué ou paraphrasé comme s'il était
 *    exhaustif.
 *  - `politique-credit-fictive` : un document métier FICTIF, explicitement
 *    demandé comme tel par l'architecture de Lory ("1-2 documents métier
 *    fictifs (politique/procédure de crédit)").
 *  - `sources-officielles-lbc-ft` : liens RÉELS (slide officielle du
 *    hackathon "Sources officielles", vérifiés le 5 septembre 2026) vers
 *    les textes BCEAO/UEMOA/GIABA/ONU applicables en LBC/FT et à la
 *    réglementation des SFD. On ne recopie jamais le contenu de ces textes
 *    (même principe que `taux-usure-sfd-bceao-2026` : jamais de contenu
 *    juridique fabriqué) — seulement où les trouver, avec la source exacte.
 */

export const CORPUS = [
  {
    id: 'teg-methode-calcul',
    title: 'Méthode de calcul du TEG utilisée par Baraka Score',
    text: `
Le Taux Effectif Global (TEG) exprime le coût réel annualisé d'un crédit, intérêts et frais compris.

Le moteur (regulatory/computeTEG.mjs) calcule d'abord la mensualité par la formule d'amortissement classique, à partir du taux nominal annuel déclaré et de la durée du crédit.

Le montant réellement perçu par l'emprunteur est le montant du crédit diminué des frais de dossier prélevés à l'octroi. Les frais réduisent donc le montant reçu sans réduire les mensualités dues, ce qui augmente mécaniquement le coût réel du crédit.

Le TEG est le taux qui égalise la valeur actuelle des mensualités futures avec le montant réellement perçu. Ce taux est recherché par bissection (recherche dichotomique), une méthode numérique simple et fiable, plutôt qu'une formule fermée qui n'existe pas en général pour ce type de calcul.

Le TEG annuel est ensuite comparé à un plafond réglementaire (le taux d'usure applicable). Si le TEG dépasse ce plafond, le crédit est signalé comme non conforme.

Ce calcul est entièrement déterministe : à mêmes montant, durée, taux et frais, le résultat est toujours identique. Aucun modèle de langage n'intervient dans ce calcul, conformément à la règle d'architecture : le RAG explique, il ne remplace jamais le moteur réglementaire.
    `.trim(),
  },
  {
    id: 'taux-usure-sfd-bceao-2026',
    title: "Taux d'usure applicable aux SFD/institutions de microfinance (UMOA)",
    text: `
Le taux d'usure applicable aux systèmes financiers décentralisés (SFD) borne, en amont, le coût total qu'un emprunteur peut supporter.

Valeur en vigueur depuis le 1er juin 2026 : 24% l'an (TAEG) pour les établissements financiers de crédit et les institutions de microfinance (systèmes financiers décentralisés, SFD) dans l'espace UMOA — abaissé de 27% à 24% par la Décision n°19/29-12-2025/CM/UMOA du Conseil des Ministres de l'UMOA (31 décembre 2025). Le plafond applicable aux banques est distinct (14% l'an).

Sources : BCEAO, "Taux d'usure pour les opérations de crédit des SFD dans la zone UMOA" (bceao.int/fr/documents/taux-dusure-pour-les-operations-de-credit-des-sfd-dans-la-zone-umoa) ; Agence Ecofin, "UMOA : le taux de l'usure pour les institutions de microfinance passe à 24% en juin" (agenceecofin.com) — cf. SOURCES_METHODOLOGIE.md pour le détail complet et la date de vérification.

Ce document donne le taux et sa source, pas le texte légal complet de la décision (conditions détaillées de calcul du TEG, éléments de coût exclus, sanctions applicables...) : pour une utilisation officielle, se référer au texte BCEAO original ci-dessus, jamais à un résumé qui pourrait être incomplet.

Dans le prototype, le plafond utilisé par le moteur (regulatory/computeTEG.mjs) reprend cette valeur (24% par défaut, cf. DEFAULT_TAUX_USURE) mais reste un paramètre configurable (\`plafond\`), pas une constante figée — pour absorber un futur recalibrage BCEAO sans modifier le code.
    `.trim(),
  },
  {
    id: 'politique-credit-fictive',
    title: 'Politique de crédit interne — document FICTIF pour la démonstration',
    text: `
Ce document est fictif, rédigé uniquement pour démontrer le fonctionnement du RAG pendant le hackathon. Il ne reflète la politique d'aucune institution réelle.

Seuils de décision indicatifs : un score de scoring supérieur ou égal à 70 conduit à une recommandation d'octroi ; entre 40 et 69, le dossier doit être examiné manuellement par un agent senior ; en dessous de 40, le crédit n'est pas recommandé en l'état.

Cas des primo-demandeurs (cold start) : en l'absence d'historique de crédit interne, l'agent s'appuie sur le profil de substitution du demandeur (ancienneté de l'activité, régularité de l'épargne ou de la tontine, réputation de terrain, solidité de la caution). Le manque d'historique ne doit jamais, à lui seul, justifier un refus automatique.

Garanties : une caution personnelle est acceptée si sa solidité (capacité financière du garant) est jugée suffisante. Une garantie matérielle qui se déprécie dans le temps (véhicule) justifie un examen plus prudent qu'une garantie qui conserve ou prend de la valeur (parcelle, foncier).

Révision : toute décision automatisée reste soumise à validation humaine. L'agent peut à tout moment surclasser ou déclasser une recommandation (agent_override), à condition de motiver sa décision dans la fiche de décision.
    `.trim(),
  },
  {
    id: 'sources-officielles-lbc-ft',
    title: 'Sources officielles — LBC/FT et réglementation des SFD (liens vérifiés)',
    text: `
Ce document liste où trouver les textes réglementaires réels applicables à la lutte contre le blanchiment de capitaux et le financement du terrorisme (LBC/FT), et à la réglementation des systèmes financiers décentralisés (SFD, microfinance) — pas leur contenu. Sources publiques BCEAO, UEMOA, GIABA et Nations unies, adresses vérifiées le 5 septembre 2026.

BCEAO — LBC/FT : tous les textes en vigueur (loi uniforme, directives, instructions d'application). www.bceao.int/fr/reglementations/lutte-contre-le-blanchiment-de-capitaux-et-le-financement-du-terrorisme

Loi uniforme LBC/FT/FP : le texte de référence, adopté le 31 mars 2023 par le Conseil des Ministres de l'UMOA. www.bceao.int/fr/reglementations/loi-uniforme-relative-la-lutte-contre-le-blanchiment-de-capitaux-le-financement-du

Directive 02/2015/CM/UEMOA : le socle régional du dispositif, adopté le 2 juillet 2015. www.bceao.int/sites/default/files/2017-11/directive_no02_2015_cm_uemoa_lbc_ft-2.pdf

BCEAO — réglementation des SFD : loi portant réglementation des systèmes financiers décentralisés, instructions comptables et prudentielles. www.bceao.int/fr/reglementations/reglementation-des-systemes-financiers-decentralises

GIABA : l'organisme régional de type GAFI (Groupe d'Action Financière) pour l'Afrique de l'Ouest. www.giaba.org

ONU — liste consolidée des sanctions : la liste du Conseil de sécurité contre laquelle un filtrage (screening) se compare avant d'engager une relation avec un client. scsanctions.un.org/consolidated — export exploitable en XML : scsanctions.un.org/resources/xml/en/consolidated.xml

Ce document ne remplace ni le plafond réglementaire du TEG (sujet distinct, voir le document dédié) ni un vrai contrôle de conformité : c'est un point de départ pour trouver le texte exact, jamais une synthèse de son contenu.
    `.trim(),
  },
]
