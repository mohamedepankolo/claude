import { useState } from 'react'
import DossierForm from './DossierForm.jsx'
import DocumentImportPanel from './DocumentImportPanel.jsx'
import AudioInterviewPanel from './AudioInterviewPanel.jsx'

const TABS = [
  ['formulaire', 'Formulaire'],
  ['documents', 'Documents'],
  ['audio', 'Entretien audio'],
]

/**
 * "Informations du dossier" — un seul card à onglets pour les 3 façons
 * d'apporter les informations (formulaire, dossier scanné, entretien
 * enregistré), reprenant la structure de la maquette de référence
 * (index-light.html) fournie par l'équipe. Les 3 panneaux restent montés
 * (juste masqués en CSS) en changeant d'onglet, pour ne jamais perdre une
 * saisie manuelle en cours en allant importer un document.
 */
export default function SourceTabs({ onSubmit, submitting, prefill, prefillVersion, onExtracted }) {
  const [tab, setTab] = useState('formulaire')

  return (
    <div className="card source-card">
      <div className="source-card-head">
        <h2>Informations du dossier</h2>
        <div className="card-sub" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
          Renseignez le formulaire, ou apportez ce que vous avez déjà : fiche scannée, entretien enregistré.
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="tab-panel" style={{ display: tab === 'formulaire' ? 'block' : 'none' }}>
        <DossierForm key={prefillVersion} onSubmit={onSubmit} submitting={submitting} prefill={prefill} />
      </div>
      <div className="tab-panel" style={{ display: tab === 'documents' ? 'block' : 'none' }}>
        <DocumentImportPanel onExtracted={onExtracted} />
      </div>
      <div className="tab-panel" style={{ display: tab === 'audio' ? 'block' : 'none' }}>
        <AudioInterviewPanel onExtracted={onExtracted} />
      </div>
    </div>
  )
}
