import { useState } from 'react'

const SECTEURS = [
  ['commerce_detail', 'Commerce de détail'],
  ['vente_vivres', 'Vente de vivres'],
  ['quincaillerie_materiaux', 'Quincaillerie / matériaux'],
  ['services', 'Services'],
  ['artisanat', 'Artisanat'],
  ['agriculture', 'Agriculture'],
]

// Champs issus du référentiel complet de Prisca (session de mentoring 3,
// cf. PLAN_RISQUE.md) — jamais transmis au modèle ML, consommés uniquement
// par @scoring/applyBusinessGuardrails (garde-fous métier P0/P1).
const TYPES_CREDIT = [
  ['productif_fonds_roulement', 'Productif — fonds de roulement'],
  ['productif_equipement', 'Productif — équipement'],
  ['productif_immobilier', 'Productif — immobilier'],
  ['salarie_scolaire', 'Salarié — crédit scolaire'],
  ['salarie_autre', 'Salarié — autre'],
  ['agricole', 'Agricole'],
  ['btp_marche_public', 'BTP / marché public'],
]
const TYPES_GARANTIE = [
  ['aucune', 'Aucune'],
  ['foncier', 'Foncier / PUH / titre foncier'],
  ['vehicule', 'Véhicule (carte grise)'],
  ['materiel', 'Matériel / équipement'],
  ['caution_solidaire', 'Cautionnement solidaire'],
  ['domiciliation_salaire', 'Domiciliation de salaire'],
]

const initial = {
  clientName: '',
  genre: '',
  age: '',
  zone: 'urbain',
  secteur: 'commerce_detail',
  employeur_nom: '',
  informel: false,
  personnes_a_charge: '',
  anciennete_activite_mois: '',
  chiffre_affaires: '',
  charges_activite: '',
  flux_tresorerie_net: '',
  charges_perso: '',
  montant_demande: '',
  duree_mois: '12',
  epargne_mensuelle: '',
  regularite_epargne: '',
  participe_tontine: false,
  regularite_tontine: '',
  a_historique: false,
  nb_credits_anterieurs: '',
  nb_retards: '',
  deja_impaye: false,
  a_caution: false,
  capacite_caution: '',
  score_reputation: '0.7',
  anciennete_membre_mois: '',
  endettement_externe_declare: '',
  montant_dernier_credit: '',
  type_credit: 'productif_fonds_roulement',
  type_garantie: 'aucune',
  valeur_garantie: '',
  pertinence_saisonniere: 'neutre',
  croissance_ventes_pct: '',
}

// Fusionne les valeurs pré-remplies par l'import (PDF/audio, cf.
// DocumentImportPanel.jsx) avec les valeurs par défaut du formulaire — les
// champs extraits arrivent en types JS natifs (nombre/booléen), les champs
// du formulaire sont des chaînes contrôlées : on convertit ici, une seule
// fois, plutôt que dans chaque `<input>`.
function mergePrefill(base, prefill) {
  if (!prefill) return base
  const merged = { ...base }
  for (const [k, v] of Object.entries(prefill)) {
    if (v === undefined || v === null || v === '') continue
    merged[k] = typeof v === 'boolean' ? v : String(v)
  }
  // Si des champs d'historique sont extraits, l'agent n'a pas forcément
  // coché "a un historique" lui-même : on l'active pour que ces champs
  // restent visibles à la relecture plutôt que masqués silencieusement.
  if (prefill.nb_credits_anterieurs || prefill.nb_retards || prefill.montant_dernier_credit) {
    merged.a_historique = true
  }
  return merged
}

export default function DossierForm({ onSubmit, submitting, prefill }) {
  const [form, setForm] = useState(() => mergePrefill(initial, prefill))

  const set = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: val }))
  }
  const num = (v, fallback = 0) => (v === '' || v === undefined ? fallback : Number(v))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.clientName || !form.montant_demande || !form.chiffre_affaires) return

    const chiffre_affaires = num(form.chiffre_affaires)
    const charges_activite = num(form.charges_activite)
    const revenu_activite = Math.max(0, chiffre_affaires - charges_activite)

    onSubmit({
      clientName: form.clientName,
      genre: form.genre || null,
      age: num(form.age, null),
      zone: form.zone,
      secteur: form.secteur,
      employeur_nom: form.employeur_nom || null,
      informel: form.informel,
      personnes_a_charge: num(form.personnes_a_charge, null),
      anciennete_activite_mois: num(form.anciennete_activite_mois, 6),
      chiffre_affaires,
      charges_activite,
      revenu_activite,
      flux_tresorerie_net: num(form.flux_tresorerie_net, revenu_activite),
      charges_perso: num(form.charges_perso),
      montant_demande: num(form.montant_demande),
      duree_mois: num(form.duree_mois, 12),
      epargne_mensuelle: num(form.epargne_mensuelle, null),
      regularite_epargne: num(form.regularite_epargne, null),
      participe_tontine: form.participe_tontine,
      regularite_tontine: num(form.regularite_tontine),
      a_historique: form.a_historique,
      nb_credits_anterieurs: num(form.nb_credits_anterieurs),
      nb_retards: num(form.nb_retards),
      deja_impaye: form.deja_impaye,
      a_caution: form.a_caution,
      capacite_caution: num(form.capacite_caution, form.a_caution ? null : 0),
      score_reputation: num(form.score_reputation, 0.5),
      anciennete_membre_mois: num(form.anciennete_membre_mois, null),
      endettement_externe_declare: num(form.endettement_externe_declare, null),
      montant_dernier_credit: num(form.montant_dernier_credit, form.a_historique ? null : 0),
      type_credit: form.type_credit,
      type_garantie: form.type_garantie,
      valeur_garantie: num(form.valeur_garantie, form.type_garantie !== 'aucune' ? null : 0),
      pertinence_saisonniere: form.pertinence_saisonniere,
      croissance_ventes_pct: num(form.croissance_ventes_pct, null),
    })
    setForm(initial)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      {prefill && Object.keys(prefill).length > 0 && (
        <div className="import-banner">
          {Object.keys(prefill).length} champ(s) pré-rempli(s) depuis le document importé — vérifiez et corrigez
          avant de valider (rien n'est validé automatiquement).
        </div>
      )}

      <fieldset><legend>Identité &amp; activité</legend>
        <div className="grid2">
          <label>Nom du demandeur
            <input value={form.clientName} onChange={set('clientName')} placeholder="Nom et prénom(s)" required />
          </label>
          <label>Genre <span className="hint">(audit d'équité uniquement, jamais utilisé par le score)</span>
            <select value={form.genre} onChange={set('genre')}>
              <option value="">Non renseigné</option>
              <option value="F">F</option>
              <option value="M">M</option>
            </select>
          </label>
          <label>Âge <input type="number" min="18" value={form.age} onChange={set('age')} /></label>
          <label>Zone
            <select value={form.zone} onChange={set('zone')}>
              <option value="urbain">Urbain</option>
              <option value="rural">Rural</option>
            </select>
          </label>
          <label>Secteur d'activité
            <select value={form.secteur} onChange={set('secteur')}>
              {SECTEURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Employeur <span className="hint">si salarié — sinon la veille suit l'activité/secteur</span>
            <input type="text" value={form.employeur_nom} onChange={set('employeur_nom')} placeholder="Optionnel" />
          </label>
          <label>Ancienneté de l'activité (mois, min. 6)
            {/* Pas de contrainte HTML `min` ici volontairement : une valeur
                sous le seuil doit être bloquée par @scoring/checkAbstention
                avec une explication claire, pas par une bulle de validation
                du navigateur qui ne dit rien du pourquoi métier. */}
            <input type="number" min="0" value={form.anciennete_activite_mois} onChange={set('anciennete_activite_mois')} />
          </label>
          <label>Personnes à charge <input type="number" min="0" value={form.personnes_a_charge} onChange={set('personnes_a_charge')} /></label>
          <label className="checkline"><input type="checkbox" checked={form.informel} onChange={set('informel')} /> Activité informelle</label>
        </div>
      </fieldset>

      <fieldset><legend>Capacité de remboursement</legend>
        <div className="grid2">
          <label>Chiffre d'affaires mensuel (FCFA) <input type="number" min="0" value={form.chiffre_affaires} onChange={set('chiffre_affaires')} required /></label>
          <label>Charges de l'activité (achats, FCFA/mois) <input type="number" min="0" value={form.charges_activite} onChange={set('charges_activite')} /></label>
          <label>Flux de trésorerie net (FCFA/mois) <input type="number" value={form.flux_tresorerie_net} onChange={set('flux_tresorerie_net')} placeholder="= bénéfice si laissé vide" /></label>
          <label>Charges personnelles (FCFA/mois) <input type="number" min="0" value={form.charges_perso} onChange={set('charges_perso')} /></label>
        </div>
      </fieldset>

      <fieldset><legend>Crédit demandé</legend>
        <div className="grid2">
          <label>Montant demandé (FCFA) <input type="number" min="150000" value={form.montant_demande} onChange={set('montant_demande')} required /></label>
          <label>Durée (mois)
            <select value={form.duree_mois} onChange={set('duree_mois')}>
              {[6, 9, 12, 18, 24, 36, 48].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>Type de crédit <span className="hint">(détermine la durée usuelle attendue)</span>
            <select value={form.type_credit} onChange={set('type_credit')}>
              {TYPES_CREDIT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset><legend>Évaluation terrain <span className="hint">(jugement déclaré par l'agent, pas une donnée du modèle)</span></legend>
        <div className="grid2">
          <label>Pertinence saisonnière du besoin
            <select value={form.pertinence_saisonniere} onChange={set('pertinence_saisonniere')}>
              <option value="favorable">Favorable (avant la période de pointe)</option>
              <option value="neutre">Neutre</option>
              <option value="defavorable">Défavorable (hors cycle de l'activité)</option>
            </select>
          </label>
          <label>Croissance des ventes déclarée (%) <span className="hint">peut être négative</span>
            <input type="number" step="1" value={form.croissance_ventes_pct} onChange={set('croissance_ventes_pct')} placeholder="ex. -20" />
          </label>
        </div>
      </fieldset>

      <fieldset><legend>Relation avec l'institution &amp; endettement externe</legend>
        <div className="grid2">
          <label>Ancienneté du membre dans l'institution (mois) <span className="hint">≠ ancienneté de l'activité</span>
            <input type="number" min="0" value={form.anciennete_membre_mois} onChange={set('anciennete_membre_mois')} />
          </label>
          <label>Endettement externe déclaré (FCFA) <span className="hint">autres institutions — proxy BIC</span>
            <input type="number" min="0" value={form.endettement_externe_declare} onChange={set('endettement_externe_declare')} />
          </label>
        </div>
      </fieldset>

      <fieldset><legend>Épargne &amp; discipline financière</legend>
        <div className="grid2">
          <label>Épargne mensuelle (FCFA) <input type="number" min="0" value={form.epargne_mensuelle} onChange={set('epargne_mensuelle')} /></label>
          <label>Régularité de l'épargne (0-1) <input type="number" min="0" max="1" step="0.05" value={form.regularite_epargne} onChange={set('regularite_epargne')} /></label>
          <label className="checkline"><input type="checkbox" checked={form.participe_tontine} onChange={set('participe_tontine')} /> Participe à une tontine</label>
          {form.participe_tontine && (
            <label>Régularité de la tontine (0-1) <input type="number" min="0" max="1" step="0.05" value={form.regularite_tontine} onChange={set('regularite_tontine')} /></label>
          )}
        </div>
      </fieldset>

      <fieldset><legend>Historique de crédit</legend>
        <label className="checkline"><input type="checkbox" checked={form.a_historique} onChange={set('a_historique')} /> A déjà un historique de crédit chez nous (sinon : primo-demandeur / cold start)</label>
        {form.a_historique && (
          <div className="grid2">
            <label>Crédits antérieurs <input type="number" min="0" value={form.nb_credits_anterieurs} onChange={set('nb_credits_anterieurs')} /></label>
            <label>Retards passés <input type="number" min="0" value={form.nb_retards} onChange={set('nb_retards')} /></label>
            <label className="checkline"><input type="checkbox" checked={form.deja_impaye} onChange={set('deja_impaye')} /> A déjà eu un impayé</label>
            <label>Montant du dernier crédit (FCFA) <span className="hint">progressivité du crédit</span>
              <input type="number" min="0" value={form.montant_dernier_credit} onChange={set('montant_dernier_credit')} />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset><legend>Garanties &amp; réputation</legend>
        <div className="grid2">
          <label className="checkline"><input type="checkbox" checked={form.a_caution} onChange={set('a_caution')} /> Caution personnelle déclarée</label>
          {form.a_caution && (
            <label>Solidité de la caution (0-1) <input type="number" min="0" max="1" step="0.05" value={form.capacite_caution} onChange={set('capacite_caution')} /></label>
          )}
          <label>Réputation de terrain (0-1) <input type="number" min="0" max="1" step="0.05" value={form.score_reputation} onChange={set('score_reputation')} /></label>
          <label>Type de garantie
            <select value={form.type_garantie} onChange={set('type_garantie')}>
              {TYPES_GARANTIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {form.type_garantie !== 'aucune' && (
            <label>Valeur estimée de la garantie (FCFA)
              <input type="number" min="0" value={form.valeur_garantie} onChange={set('valeur_garantie')} />
            </label>
          )}
        </div>
      </fieldset>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Analyse en cours…' : "Créer le dossier et lancer l'analyse"}
      </button>
    </form>
  )
}
