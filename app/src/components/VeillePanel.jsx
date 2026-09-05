import { useEffect, useState } from 'react'
import { runVeilleForApplication, listAlertesForApplication, updateAlerteStatut } from '../db/index.js'

const STATUT_LABEL = {
  a_verifier: 'À vérifier', confirme_pertinent: 'Confirmé pertinent', ecarte: 'Écarté', dossier_actualise: 'Dossier actualisé',
}
const TYPE_LABEL = {
  retard_salarial: 'Retard de salaire', fermeture: "Fermeture d'activité", perte_contrat: 'Perte de contrat',
}

/**
 * Veille employeur/activité — cf. rapport "Veille et corpus multiformat".
 * Recherche dans un flux SYNTHÉTIQUE (jamais un vrai connecteur web pour
 * cette version, cf. veille/README.md) les événements pouvant fragiliser
 * les revenus du client, avant ou pendant le remboursement. Ne modifie
 * JAMAIS le score automatiquement — seulement une alerte à revoir par l'agent.
 */
export default function VeillePanel({ dossier, onEditDossier }) {
  const [alertes, setAlertes] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  useEffect(() => {
    if (!dossier?.id) return
    listAlertesForApplication(dossier.id).then(setAlertes)
  }, [dossier?.id])

  if (!dossier) return null

  async function handleRunVeille() {
    setLoading(true)
    try {
      await runVeilleForApplication(dossier.id, dossier)
      setAlertes(await listAlertesForApplication(dossier.id))
      setLastRun(new Date())
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(alerteId, statut) {
    const motif = window.prompt(
      statut === 'ecarte' ? "Motif pour écarter cette alerte :" : 'Motif / commentaire (optionnel) :'
    )
    if (statut === 'ecarte' && !motif) return // un écart doit être motivé
    await updateAlerteStatut(alerteId, statut, motif || null)
    setAlertes(await listAlertesForApplication(dossier.id))
  }

  return (
    <div className="card">
      <h3>Veille employeur / activité <span className="hint">flux synthétique de démonstration</span></h3>
      <div className="teg-note">
        Recherche des événements pouvant fragiliser les revenus du client (retard de salaire, fermeture,
        perte de contrat) liés à son employeur déclaré ou, à défaut, à son secteur d'activité. Ne modifie
        jamais le score : chaque signal reste une alerte à vérifier par l'agent, jamais une pénalité automatique.
      </div>

      <button type="button" className="btn-primary" onClick={handleRunVeille} disabled={loading} style={{ width: 'auto' }}>
        {loading ? 'Recherche en cours…' : 'Lancer la veille'}
      </button>
      {lastRun && <div className="hint" style={{ marginTop: 8 }}>Dernière actualisation : {lastRun.toLocaleString('fr-FR')}</div>}

      {alertes.length === 0 && <div className="empty" style={{ marginTop: 14 }}>Aucune alerte pour ce dossier pour l'instant.</div>}

      {alertes.length > 0 && (
        <ul className="reliability-list" style={{ marginTop: 14 }}>
          {alertes.map((a) => (
            <li key={a.id}>
              <strong>{TYPE_LABEL[a.evenement?.type] ?? a.evenement?.type}</strong> — {a.evenement?.extrait}
              <div className="hint">
                Source : {a.evenement?.source_titre} ({a.evenement?.date_publication})
                {a.evenement?.nb_reprises > 0 && ` · repris ${a.evenement.nb_reprises} fois (compté une seule fois)`}
                {a.evenement?.qualite_rapprochement === 'nom_seul_homonyme_possible' && ' · nom seul, homonyme possible — à vérifier avant toute action'}
              </div>
              <div style={{ marginTop: 6 }}>
                Statut : <strong>{STATUT_LABEL[a.statut] ?? a.statut}</strong>
                {a.motif && <span className="hint"> — {a.motif}</span>}
              </div>
              {a.statut === 'a_verifier' && (
                <div className="button-row" style={{ marginTop: 8 }}>
                  <button type="button" className="chip" onClick={() => handleReview(a.id, 'confirme_pertinent')}>Confirmer pertinent</button>
                  <button type="button" className="chip" onClick={() => handleReview(a.id, 'ecarte')}>Écarter</button>
                </div>
              )}
              {a.statut === 'confirme_pertinent' && onEditDossier && (
                <div className="button-row" style={{ marginTop: 8 }}>
                  <button type="button" className="chip" onClick={() => { updateAlerteStatut(a.id, 'dossier_actualise', a.motif).then(() => listAlertesForApplication(dossier.id).then(setAlertes)); onEditDossier() }}>
                    Actualiser le dossier et relancer l'évaluation
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
