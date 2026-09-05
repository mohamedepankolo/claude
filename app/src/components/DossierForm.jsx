import { useState } from 'react'

const initial = {
  clientName: '',
  purpose: 'commerce',
  business_age: '',
  amount_requested: '',
  duration: '12',
  income: '',
  expenses: '',
  savings: false,
  guarantee: false,
  hasPriorCredit: false,
  incidents_last_12m: '',
  repayment_rate_pct: '',
  reputation: 'good',
  guarantor_strength: 'good',
  sector_dynamics: 'favorable',
  agency_distance_km: '',
}

export default function DossierForm({ onSubmit, submitting }) {
  const [form, setForm] = useState(initial)

  const set = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: val }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.clientName || !form.amount_requested) return
    onSubmit({
      clientName: form.clientName,
      purpose: form.purpose,
      business_age: Number(form.business_age) || 0,
      amount_requested: Number(form.amount_requested) || 0,
      duration: Number(form.duration) || 12,
      income: Number(form.income) || 0,
      expenses: Number(form.expenses) || 0,
      savings: form.savings,
      guarantee: form.guarantee,
      extra: {
        history: form.hasPriorCredit
          ? { has_prior_credit: true, incidents_last_12m: Number(form.incidents_last_12m) || 0, repayment_rate_pct: Number(form.repayment_rate_pct) || 90 }
          : { has_prior_credit: false },
        profile: {
          reputation: form.reputation,
          guarantor_strength: form.guarantor_strength,
          sector_dynamics: form.sector_dynamics,
          agency_distance_km: Number(form.agency_distance_km) || 2,
        },
      },
    })
    setForm(initial)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Nouveau dossier</h2>

      <div className="grid2">
        <label>Nom du demandeur
          <input value={form.clientName} onChange={set('clientName')} placeholder="Nom et prénom(s)" required />
        </label>
        <label>Secteur d'activité
          <select value={form.purpose} onChange={set('purpose')}>
            <option value="commerce">Commerce</option>
            <option value="agriculture">Agriculture</option>
            <option value="services">Services</option>
            <option value="artisanat">Artisanat</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label>Ancienneté de l'activité (mois)
          <input type="number" min="0" value={form.business_age} onChange={set('business_age')} />
        </label>
        <label>Montant demandé (FCFA)
          <input type="number" min="0" value={form.amount_requested} onChange={set('amount_requested')} required />
        </label>
        <label>Durée (mois)
          <input type="number" min="1" value={form.duration} onChange={set('duration')} />
        </label>
        <label>Capacité mensuelle / revenu (FCFA)
          <input type="number" min="0" value={form.income} onChange={set('income')} />
        </label>
        <label>Charges financières actuelles (FCFA/mois)
          <input type="number" min="0" value={form.expenses} onChange={set('expenses')} />
        </label>
        <label>Proximité de l'agence (km)
          <input type="number" min="0" value={form.agency_distance_km} onChange={set('agency_distance_km')} />
        </label>
      </div>

      <div className="grid2">
        <label className="checkline"><input type="checkbox" checked={form.savings} onChange={set('savings')} /> Épargne régulière / tontine active</label>
        <label className="checkline"><input type="checkbox" checked={form.guarantee} onChange={set('guarantee')} /> Caution personnelle déclarée</label>
        <label>Réputation de terrain
          <select value={form.reputation} onChange={set('reputation')}>
            <option value="good">Bonne</option>
            <option value="average">Moyenne</option>
            <option value="to_verify">À vérifier</option>
          </select>
        </label>
        <label>Dynamique du secteur
          <select value={form.sector_dynamics} onChange={set('sector_dynamics')}>
            <option value="favorable">Favorable</option>
            <option value="stable">Stable</option>
            <option value="difficult">Difficile</option>
          </select>
        </label>
      </div>

      <label className="checkline"><input type="checkbox" checked={form.hasPriorCredit} onChange={set('hasPriorCredit')} /> A déjà eu un crédit (sinon : profil primo-demandeur / cold start)</label>
      {form.hasPriorCredit && (
        <div className="grid2">
          <label>Incidents / retards (12 mois)
            <input type="number" min="0" value={form.incidents_last_12m} onChange={set('incidents_last_12m')} />
          </label>
          <label>Taux de remboursement estimé (%)
            <input type="number" min="0" max="100" value={form.repayment_rate_pct} onChange={set('repayment_rate_pct')} />
          </label>
        </div>
      )}

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Analyse en cours…' : "Créer le dossier et lancer l'analyse"}
      </button>
    </form>
  )
}
