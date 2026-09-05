/**
 * Baraka Score — corpus RAG (MVP minimal et fiable, cf. architecture de Lory
 * section 6 : "ne cherchez pas à ingérer toute la réglementation").
 *
 * Trois documents contrôlés, volontairement courts :
 *  - `teg-methode-calcul` : documentation réelle de notre propre méthode de
 *    calcul (@regulatory/computeTEG.mjs) — pas une source externe, mais un
 *    contenu honnête sur ce que le moteur fait réellement.
 *  - `taux-usure-a-completer` : un CANEVAS, pas un texte réglementaire
 *    inventé. Le taux d'usure réel doit venir du texte BCEAO applicable —
 *    on ne fabrique jamais de contenu juridique qui pourrait passer pour
 *    authentique.
 *  - `politique-credit-fictive` : un document métier FICTIF, explicitement
 *    demandé comme tel par l'architecture de Lory ("1-2 documents métier
 *    fictifs (politique/procédure de crédit)").
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
    id: 'taux-usure-a-completer',
    title: 'Taux d\'usure applicable — CANEVAS À COMPLÉTER (pas un texte réglementaire)',
    text: `
ATTENTION : ce document est un CANEVAS pour la démonstration du prototype, pas le texte réglementaire réel. Il liste ce que le texte BCEAO applicable doit préciser ; il doit être remplacé par le texte exact avant toute utilisation officielle.

Éléments à renseigner à partir du texte BCEAO réel :
- Définition exacte du taux d'usure applicable dans l'espace UEMOA.
- Plafond applicable selon le type d'établissement (banque, système financier décentralisé / microfinance).
- Plafond applicable selon le type de crédit (consommation, habitat, professionnel, agricole).
- Éléments de coût qui entrent dans le calcul du TEG selon le texte (intérêts, frais de dossier, assurance emprunteur obligatoire, etc.) et ceux qui en sont explicitement exclus.
- Périodicité de révision du taux d'usure (annuelle, trimestrielle...) et source officielle de publication.
- Sanctions applicables en cas de dépassement.

Dans le prototype, le plafond utilisé par le moteur (regulatory/computeTEG.mjs) est une valeur indicative configurable (24% par défaut), clairement documentée comme placeholder. Elle doit être remplacée par la valeur exacte issue du texte ci-dessus dès qu'il est disponible.
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
]
