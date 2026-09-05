/**
 * Baraka Score — rapprochement entité (employeur/activité) ↔ flux de veille
 *
 * Implémente la règle du rapport "Veille et corpus multiformat" (section 2,
 * "Rapprocher") : *"Comparer nom, localisation et identifiants. Une simple
 * ressemblance de nom ne suffit pas."* Un nom seul, sans corroboration par
 * le secteur ou la localité, est classé comme un homonyme possible à
 * vérifier — jamais comme un rapprochement confirmé. Fonction pure,
 * déterministe, sans LLM — même principe que les autres moteurs du projet.
 */

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * @param {{ nom: string, secteur?: string, zone?: string }} entity
 * @param {Array} feed
 * @returns {{ statut: 'aucun_resultat'|'trouve', evenements: Array }}
 */
export function matchEntityEvents(entity, feed) {
  if (!entity || !entity.nom) throw new TypeError('matchEntityEvents: entity.nom requis')
  if (!Array.isArray(feed)) throw new TypeError('matchEntityEvents: feed doit être un tableau')

  const nomCible = normalize(entity.nom)
  const secteurCible = entity.secteur ? normalize(entity.secteur) : null
  const localiteCible = entity.zone ? normalize(entity.zone) : null

  const candidats = feed.filter((pub) => normalize(pub.entite_nom) === nomCible)

  const evenements = candidats.map((pub) => {
    const secteurCorrobore = secteurCible && normalize(pub.entite_secteur) === secteurCible
    const localiteCorrobore = localiteCible && normalize(pub.entite_localite).includes(localiteCible)
    let qualite
    if (secteurCorrobore && localiteCorrobore) qualite = 'nom_secteur_et_localite'
    else if (secteurCorrobore) qualite = 'nom_et_secteur'
    else if (localiteCorrobore) qualite = 'nom_et_localite'
    else qualite = 'nom_seul_homonyme_possible'
    return { ...pub, qualite_rapprochement: qualite }
  })

  return { statut: evenements.length > 0 ? 'trouve' : 'aucun_resultat', evenements }
}

/**
 * Dédoublonne des événements republiés (même empreinte) : une republication
 * du même fait par une autre source ne compte jamais comme une confirmation
 * indépendante supplémentaire (cf. rapport, "États à distinguer" : "Plusieurs
 * reprises d'un même communiqué ne constituent pas plusieurs confirmations
 * indépendantes"). Garde la première publication connue, note le nombre de reprises.
 */
export function dedupeByFingerprint(evenements) {
  const groupes = new Map()
  for (const ev of evenements) {
    if (!groupes.has(ev.empreinte)) groupes.set(ev.empreinte, [])
    groupes.get(ev.empreinte).push(ev)
  }
  return [...groupes.values()].map((groupe) => {
    const premiere = groupe.reduce((a, b) => (a.date_publication < b.date_publication ? a : b))
    return { ...premiere, nb_reprises: groupe.length - 1 }
  })
}
