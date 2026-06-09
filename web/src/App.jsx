import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './app.css'

const statusOptions = [
  { value: 'nieuw', label: 'Nieuw' },
  { value: 'intake', label: 'Call gehad' },
  { value: 'offerte_verstuurd', label: 'Offerte verstuurd' },
  { value: 'wacht_op_klant', label: 'Wacht op klant' },
  { value: 'opvolgen', label: 'Opvolgen' },
  { value: 'gewonnen', label: 'Gewonnen' },
  { value: 'verloren', label: 'Verloren' },
]

const emptyDraft = () => ({
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  request_type: '',
  request_source: '',
  request_date: new Date().toISOString().slice(0, 10),
  call_date: '',
  transcript: '',
  quote_date: '',
  quote_amount: '',
  quote_text: '',
  proposal_document_name: '',
  proposal_document_path: '',
  proposal_document_url: '',
  gmail_thread_id: '',
  gmail_thread_url: '',
  gmail_last_reply_at: '',
  gmail_last_sender: '',
  status: 'nieuw',
  follow_up_date: '',
  next_action: '',
  notes: '',
})

function currentDateTimeLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

const emptyCommunicationDraft = () => ({
  occurred_at: currentDateTimeLocal(),
  channel: '',
  actor: 'ik',
  summary: '',
  next_step: '',
  next_step_date: '',
})

function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('nl-NL', options)
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (Number.isNaN(amount)) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function isOpenStatus(status) {
  return !['gewonnen', 'verloren'].includes(status)
}

function getUrgency(item) {
  if (!item?.follow_up_date || !isOpenStatus(item.status)) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const followUp = new Date(item.follow_up_date)
  followUp.setHours(0, 0, 0, 0)
  if (followUp < today) return 'overdue'
  if ((followUp - today) / 86400000 <= 2) return 'soon'
  return 'planned'
}

function sumQuoteAmounts(items) {
  return items.reduce((total, item) => total + (Number(item.quote_amount) || 0), 0)
}

function getStatusLabel(status) {
  return statusOptions.find((option) => option.value === status)?.label || status
}

function buildCommunicationSummary(entries) {
  return entries.reduce((summary, entry) => {
    const current = summary[entry.quote_request_id] || { count: 0, latest: null }
    const latestTime = current.latest?.occurred_at ? new Date(current.latest.occurred_at).getTime() : 0
    const entryTime = entry.occurred_at ? new Date(entry.occurred_at).getTime() : 0

    summary[entry.quote_request_id] = {
      count: current.count + 1,
      latest: entryTime >= latestTime ? entry : current.latest,
    }

    return summary
  }, {})
}

function formatDaysSince(value) {
  if (!value) return 'Nog geen contact'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const diffDays = Math.max(0, Math.round((today - date) / 86400000))
  if (diffDays === 0) return 'Vandaag contact'
  if (diffDays === 1) return '1 dag stil'
  return `${diffDays} dagen stil`
}

export default function App() {
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [viewMode, setViewMode] = useState('overview')
  const [overviewFilters, setOverviewFilters] = useState({
    rest: true,
    gewonnen: true,
    verloren: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('alles')
  const [gmailEvents, setGmailEvents] = useState([])
  const [communications, setCommunications] = useState([])
  const [communicationSummaryByQuote, setCommunicationSummaryByQuote] = useState({})
  const [communicationDraft, setCommunicationDraft] = useState(emptyCommunicationDraft())
  const [savingCommunication, setSavingCommunication] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadItems()
    loadCommunicationSummary()
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setGmailEvents([])
      setCommunications([])
      return
    }
    loadGmailEvents(selectedId)
    loadCommunications(selectedId)
  }, [selectedId])

  async function loadItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setItems(data ?? [])
    if (data?.length) {
      setSelectedId(data[0].id)
      setDraft(normalizeDraft(data[0]))
    }
    setLoading(false)
  }

  async function loadGmailEvents(quoteRequestId) {
    const { data, error } = await supabase
      .from('gmail_events')
      .select('*')
      .eq('quote_request_id', quoteRequestId)
      .order('received_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setGmailEvents(data ?? [])
  }

  async function loadCommunications(quoteRequestId) {
    const { data, error } = await supabase
      .from('quote_communications')
      .select('*')
      .eq('quote_request_id', quoteRequestId)
      .order('occurred_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setCommunications(data ?? [])
  }

  async function loadCommunicationSummary() {
    const { data, error } = await supabase
      .from('quote_communications')
      .select('id, quote_request_id, occurred_at, channel, actor, next_step, next_step_date')
      .order('occurred_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setCommunicationSummaryByQuote(buildCommunicationSummary(data ?? []))
  }

  function normalizeDraft(item) {
    return {
      ...emptyDraft(),
      ...item,
      request_date: item.request_date || '',
      quote_date: item.quote_date || '',
      quote_amount: item.quote_amount ?? '',
      call_date: item.call_date ? item.call_date.slice(0, 16) : '',
      gmail_last_reply_at: item.gmail_last_reply_at ? item.gmail_last_reply_at.slice(0, 16) : '',
      follow_up_date: item.follow_up_date || '',
    }
  }

  function selectItem(item) {
    setSelectedId(item.id)
    setDraft(normalizeDraft(item))
    setViewMode('dossier')
    setMessage('')
  }

  function startNew() {
    setSelectedId(null)
    setDraft(emptyDraft())
    setViewMode('dossier')
    setGmailEvents([])
    setCommunications([])
    setCommunicationDraft(emptyCommunicationDraft())
    setMessage('')
  }

  async function saveItem() {
    if (!draft.company_name.trim()) {
      setMessage('Bedrijfsnaam is verplicht.')
      return
    }

    setSaving(true)
    setMessage('')

    const payload = {
      ...draft,
      company_name: draft.company_name.trim(),
      contact_name: draft.contact_name.trim(),
      contact_email: draft.contact_email.trim(),
      contact_phone: draft.contact_phone.trim(),
      request_type: draft.request_type.trim(),
      request_source: draft.request_source.trim(),
      transcript: draft.transcript.trim(),
      quote_amount: draft.quote_amount === '' ? null : Number(draft.quote_amount),
      quote_text: draft.quote_text.trim(),
      proposal_document_name: draft.proposal_document_name.trim(),
      proposal_document_path: draft.proposal_document_path.trim(),
      proposal_document_url: draft.proposal_document_url.trim(),
      gmail_thread_id: draft.gmail_thread_id.trim(),
      gmail_thread_url: draft.gmail_thread_url.trim(),
      gmail_last_sender: draft.gmail_last_sender.trim(),
      next_action: draft.next_action.trim(),
      notes: draft.notes.trim(),
      call_date: draft.call_date || null,
      quote_date: draft.quote_date || null,
      gmail_last_reply_at: draft.gmail_last_reply_at || null,
      follow_up_date: draft.follow_up_date || null,
    }

    let result
    if (selectedId) {
      result = await supabase
        .from('quote_requests')
        .update(payload)
        .eq('id', selectedId)
        .select()
        .single()
    } else {
      result = await supabase
        .from('quote_requests')
        .insert(payload)
        .select()
        .single()
    }

    const { data, error } = result

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    const nextItems = selectedId
      ? items.map((item) => (item.id === data.id ? data : item))
      : [data, ...items]

    nextItems.sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
    setItems(nextItems)
    setSelectedId(data.id)
    setDraft(normalizeDraft(data))
    setSaving(false)
    setMessage('Opgeslagen.')
  }

  async function deleteItem() {
    if (!selectedId) return
    const confirmed = window.confirm('Deze offerte-aanvraag verwijderen?')
    if (!confirmed) return

    const { error } = await supabase.from('quote_requests').delete().eq('id', selectedId)
    if (error) {
      setMessage(error.message)
      return
    }

    const nextItems = items.filter((item) => item.id !== selectedId)
    setItems(nextItems)
    if (nextItems.length) {
      setSelectedId(nextItems[0].id)
      setDraft(normalizeDraft(nextItems[0]))
    } else {
      setSelectedId(null)
      setDraft(emptyDraft())
    }
    setMessage('Aanvraag verwijderd.')
  }

  async function uploadDocument(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!selectedId) {
      setMessage('Sla de aanvraag eerst op voordat je een document koppelt.')
      return
    }

    setUploading(true)
    setMessage('')

    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `${selectedId}/${Date.now()}.${extension}`

    const uploadResult = await supabase.storage
      .from('quote-documents')
      .upload(path, file, { upsert: true })

    if (uploadResult.error) {
      setMessage(uploadResult.error.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('quote-documents').getPublicUrl(path)
    const nextDraft = {
      ...draft,
      proposal_document_name: file.name,
      proposal_document_path: path,
      proposal_document_url: data.publicUrl,
    }

    setDraft(nextDraft)
    setUploading(false)
    setMessage('Document geupload. Klik nog op opslaan om de koppeling vast te leggen.')
  }

  async function saveCommunication() {
    if (!selectedId) {
      setMessage('Sla de offerte eerst op voordat je communicatie toevoegt.')
      return
    }

    if (!communicationDraft.channel.trim()) {
      setMessage('Vorm van communicatie is verplicht.')
      return
    }

    if (!communicationDraft.summary.trim()) {
      setMessage('Inhoud of samenvatting is verplicht.')
      return
    }

    setSavingCommunication(true)
    setMessage('')

    const payload = {
      quote_request_id: selectedId,
      occurred_at: communicationDraft.occurred_at || null,
      channel: communicationDraft.channel.trim(),
      actor: communicationDraft.actor,
      summary: communicationDraft.summary.trim(),
      next_step: communicationDraft.next_step.trim(),
      next_step_date: communicationDraft.next_step_date || null,
    }

    const { data, error } = await supabase
      .from('quote_communications')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setMessage(error.message)
      setSavingCommunication(false)
      return
    }

    setCommunications((current) => [data, ...current])

    if (payload.next_step || payload.next_step_date) {
      const quotePatch = {
        next_action: payload.next_step || draft.next_action,
        follow_up_date: payload.next_step_date || draft.follow_up_date || null,
      }

      const { data: updatedQuote, error: quoteError } = await supabase
        .from('quote_requests')
        .update(quotePatch)
        .eq('id', selectedId)
        .select()
        .single()

      if (!quoteError && updatedQuote) {
        setDraft(normalizeDraft(updatedQuote))
        setItems((current) =>
          current
            .map((item) => (item.id === updatedQuote.id ? updatedQuote : item))
            .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at)),
        )
      }
    }

    setCommunicationDraft(emptyCommunicationDraft())
    setSavingCommunication(false)
    setMessage('Communicatie opgeslagen.')
    loadCommunicationSummary()
  }

  async function deleteCommunication(communicationId) {
    const confirmed = window.confirm('Deze communicatie-entry verwijderen?')
    if (!confirmed) return

    const { error } = await supabase.from('quote_communications').delete().eq('id', communicationId)
    if (error) {
      setMessage(error.message)
      return
    }

    setCommunications((current) => current.filter((item) => item.id !== communicationId))
    setMessage('Communicatie verwijderd.')
    loadCommunicationSummary()
  }

  const filteredItems = items.filter((item) => {
    const haystack = [
      item.company_name,
      item.contact_name,
      item.request_type,
      item.request_source,
      item.next_action,
    ]
      .join(' ')
      .toLowerCase()

    const matchesSearch = haystack.includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'alles' || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const overviewFilteredItems = filteredItems.filter((item) => {
    if (item.status === 'gewonnen') return overviewFilters.gewonnen
    if (item.status === 'verloren') return overviewFilters.verloren
    return overviewFilters.rest
  })

  const overviewItems = [...overviewFilteredItems].sort((left, right) => {
    const leftOpen = isOpenStatus(left.status)
    const rightOpen = isOpenStatus(right.status)

    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1

    const leftUrgency = getUrgency(left)
    const rightUrgency = getUrgency(right)
    const urgencyWeight = { overdue: 0, soon: 1, planned: 2, none: 3 }
    if (urgencyWeight[leftUrgency] !== urgencyWeight[rightUrgency]) {
      return urgencyWeight[leftUrgency] - urgencyWeight[rightUrgency]
    }

    const leftFollowUp = left.follow_up_date ? new Date(left.follow_up_date).getTime() : Number.POSITIVE_INFINITY
    const rightFollowUp = right.follow_up_date ? new Date(right.follow_up_date).getTime() : Number.POSITIVE_INFINITY
    if (leftFollowUp !== rightFollowUp) return leftFollowUp - rightFollowUp

    const leftUpdated = left.updated_at ? new Date(left.updated_at).getTime() : 0
    const rightUpdated = right.updated_at ? new Date(right.updated_at).getTime() : 0
    return rightUpdated - leftUpdated
  })

  const openItems = items.filter((item) => isOpenStatus(item.status))
  const followUpItems = openItems.filter((item) => getUrgency(item) === 'overdue' || getUrgency(item) === 'soon')
  const sentQuotes = items.filter((item) => ['offerte_verstuurd', 'wacht_op_klant', 'opvolgen'].includes(item.status))
  const wonItems = items.filter((item) => item.status === 'gewonnen')
  const lostItems = items.filter((item) => item.status === 'verloren')
  const amountOpen = sumQuoteAmounts(openItems)
  const amountFollowUp = sumQuoteAmounts(items.filter((item) => item.status === 'opvolgen'))
  const amountWon = sumQuoteAmounts(wonItems)
  const amountLost = sumQuoteAmounts(lostItems)

  function toggleOverviewFilter(key) {
    setOverviewFilters((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function enableAllOverviewFilters() {
    setOverviewFilters({
      rest: true,
      gewonnen: true,
      verloren: true,
    })
  }

  return (
    <div className="suite-shell">
      <aside className="suite-sidebar">
        <div className="brand-card">
          <div className="brand-kicker">Zelfstandige pipeline</div>
          <h1>Offerte Suite</h1>
          <p>Alle aanvragen, offertes, documenten en opvolgingen op een plek.</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Open</span>
            <strong>{openItems.length}</strong>
          </div>
          <div className="stat-card warn">
            <span>Opvolgen</span>
            <strong>{followUpItems.length}</strong>
          </div>
          <div className="stat-card">
            <span>Offertes uit</span>
            <strong>{sentQuotes.length}</strong>
          </div>
          <div className="stat-card success">
            <span>Gewonnen</span>
            <strong>{wonItems.length}</strong>
          </div>
        </div>

        <div className="toolbar">
          <button className="primary-button" onClick={startNew}>Nieuwe aanvraag</button>
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Zoek op bedrijf, bron of type"
          />
          <select
            className="field"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="alles">Alle statussen</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="request-list">
          {loading ? <div className="empty-state">Laden...</div> : null}
          {!loading && filteredItems.length === 0 ? (
            <div className="empty-state">Nog geen offerte-aanvragen gevonden.</div>
          ) : null}
          {filteredItems.map((item) => (
            <button
              key={item.id}
              className={`request-item ${selectedId === item.id ? 'selected' : ''} ${getUrgency(item)}`}
              onClick={() => selectItem(item)}
              type="button"
            >
              <div className="request-item-top">
                <strong>{item.company_name}</strong>
                <span className={`status-pill status-${item.status}`}>{getStatusLabel(item.status)}</span>
              </div>
              <div className="request-item-meta">
                <span>{item.request_type || 'Geen type'}</span>
                <span>{item.request_source || 'Geen bron'}</span>
                <span>{formatCurrency(item.quote_amount)}</span>
              </div>
              <div className="request-item-foot">
                <span>Aanvraag {formatDate(item.request_date)}</span>
                <span>Opvolgen {formatDate(item.follow_up_date)}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="suite-main">
        <div className="main-header">
          <div>
            <div className="eyebrow">{viewMode === 'overview' ? 'Overzichtspagina' : 'Offertedossier'}</div>
            <h2>
              {viewMode === 'overview'
                ? `${overviewItems.length} offertes en komende acties`
                : selectedId ? draft.company_name || 'Nieuwe aanvraag' : 'Nieuwe aanvraag'}
            </h2>
          </div>
          <div className="header-actions">
            <div className="view-toggle">
              <button
                className={`toggle-button ${viewMode === 'dossier' ? 'active' : ''}`}
                onClick={() => setViewMode('dossier')}
                type="button"
              >
                Dossier
              </button>
              <button
                className={`toggle-button ${viewMode === 'overview' ? 'active' : ''}`}
                onClick={() => setViewMode('overview')}
                type="button"
              >
                Overzicht
              </button>
            </div>
            {viewMode === 'dossier' ? (
              <>
                {selectedId ? <button className="ghost-button" onClick={deleteItem}>Verwijderen</button> : null}
                <button className="primary-button" onClick={saveItem} disabled={saving}>
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {message ? <div className="feedback-banner">{message}</div> : null}

        <section className="amount-dashboard">
          <div className="amount-card">
            <span>Open bedrag · {openItems.length}</span>
            <strong>{formatCurrency(amountOpen)}</strong>
          </div>
          <div className="amount-card warn">
            <span>Opvolgen bedrag · {followUpItems.length}</span>
            <strong>{formatCurrency(amountFollowUp)}</strong>
          </div>
          <div className="amount-card success">
            <span>Gewonnen bedrag · {wonItems.length}</span>
            <strong>{formatCurrency(amountWon)}</strong>
          </div>
          <div className="amount-card muted">
            <span>Verloren bedrag · {lostItems.length}</span>
            <strong>{formatCurrency(amountLost)}</strong>
          </div>
        </section>

        {viewMode === 'overview' ? (
          <>
            <section className="overview-filters">
              <button
                type="button"
                className={`overview-filter-button all ${
                  overviewFilters.rest && overviewFilters.gewonnen && overviewFilters.verloren ? 'active' : ''
                }`}
                onClick={enableAllOverviewFilters}
              >
                Alle
              </button>
              <button
                type="button"
                className={`overview-filter-button ${overviewFilters.rest ? 'active rest' : ''}`}
                onClick={() => toggleOverviewFilter('rest')}
              >
                Rest
              </button>
              <button
                type="button"
                className={`overview-filter-button ${overviewFilters.gewonnen ? 'active gewonnen' : ''}`}
                onClick={() => toggleOverviewFilter('gewonnen')}
              >
                Gewonnen
              </button>
              <button
                type="button"
                className={`overview-filter-button ${overviewFilters.verloren ? 'active verloren' : ''}`}
                onClick={() => toggleOverviewFilter('verloren')}
              >
                Verloren
              </button>
            </section>
            <section className="overview-grid">
            {overviewItems.length === 0 ? (
              <div className="empty-state overview-empty">Geen offertes binnen deze selectie.</div>
            ) : null}
            {overviewItems.map((item) => (
              (() => {
                const communicationSummary = communicationSummaryByQuote[item.id]
                const latestCommunication = communicationSummary?.latest

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`overview-card ${getUrgency(item)} ${selectedId === item.id ? 'selected' : ''}`}
                    onClick={() => selectItem(item)}
                  >
                    <div className="overview-card-top">
                      <strong>{item.company_name}</strong>
                      <span className={`status-pill status-${item.status}`}>{getStatusLabel(item.status)}</span>
                    </div>
                    <div className="overview-amount">{formatCurrency(item.quote_amount)}</div>
                    <div className="overview-meta">
                      <span>{item.contact_name || 'Geen contact'}</span>
                      <span>{item.request_type || 'Geen type'}</span>
                      <span>{item.request_source || 'Geen bron'}</span>
                    </div>
                    <div className="overview-copy">
                      {item.next_action || item.quote_text || item.notes || 'Nog geen verdere inhoud toegevoegd.'}
                    </div>
                    <div className="overview-communication">
                      <span>Contactmomenten {communicationSummary?.count || 0}</span>
                      <span>{latestCommunication ? `Laatste ${latestCommunication.channel} · ${latestCommunication.actor}` : 'Nog geen contact'}</span>
                      <span>{formatDaysSince(latestCommunication?.occurred_at)}</span>
                    </div>
                    <div className="overview-footer">
                      <span>{item.next_action || 'Geen actie gepland'}</span>
                      <span>Opvolgen {formatDate(item.follow_up_date)}</span>
                    </div>
                  </button>
                )
              })()
            ))}
            </section>
          </>
        ) : (
        <div className="form-grid">
          <section className="panel">
            <div className="panel-title">Basis</div>
            <label className="field-group">
              <span>Bedrijf</span>
              <input
                className="field"
                value={draft.company_name}
                onChange={(event) => setDraft({ ...draft, company_name: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Contactpersoon</span>
              <input
                className="field"
                value={draft.contact_name}
                onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })}
              />
            </label>
            <div className="double-grid">
              <label className="field-group">
                <span>E-mail</span>
                <input
                  className="field"
                  value={draft.contact_email}
                  onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Telefoon</span>
                <input
                  className="field"
                  value={draft.contact_phone}
                  onChange={(event) => setDraft({ ...draft, contact_phone: event.target.value })}
                />
              </label>
            </div>
            <div className="double-grid">
              <label className="field-group">
                <span>Soort aanvraag</span>
                <input
                  className="field"
                  placeholder="LinkedIn, AI, strategie..."
                  value={draft.request_type}
                  onChange={(event) => setDraft({ ...draft, request_type: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Bron</span>
                <input
                  className="field"
                  placeholder="Via website, DM, referral..."
                  value={draft.request_source}
                  onChange={(event) => setDraft({ ...draft, request_source: event.target.value })}
                />
              </label>
            </div>
            <div className="triple-grid">
              <label className="field-group">
                <span>Datum aanvraag</span>
                <input
                  type="date"
                  className="field"
                  value={draft.request_date}
                  onChange={(event) => setDraft({ ...draft, request_date: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Datum call</span>
                <input
                  type="datetime-local"
                  className="field"
                  value={draft.call_date}
                  onChange={(event) => setDraft({ ...draft, call_date: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Status</span>
                <select
                  className="field"
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Offerte en opvolging</div>
            <div className="double-grid">
              <label className="field-group">
                <span>Datum offerte</span>
                <input
                  type="date"
                  className="field"
                  value={draft.quote_date}
                  onChange={(event) => setDraft({ ...draft, quote_date: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Offerte bedrag</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="field"
                  placeholder="2500"
                  value={draft.quote_amount}
                  onChange={(event) => setDraft({ ...draft, quote_amount: event.target.value })}
                />
              </label>
            </div>
            <div className="double-grid">
              <label className="field-group">
                <span>Volgende opvolgdatum</span>
                <input
                  type="date"
                  className="field"
                  value={draft.follow_up_date}
                  onChange={(event) => setDraft({ ...draft, follow_up_date: event.target.value })}
                />
              </label>
            </div>
            <label className="field-group">
              <span>Volgende actie</span>
              <input
                className="field"
                placeholder="Bel vrijdag na, stuur reminder, plan demo..."
                value={draft.next_action}
                onChange={(event) => setDraft({ ...draft, next_action: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Offerte tekst</span>
              <textarea
                className="field textarea"
                value={draft.quote_text}
                onChange={(event) => setDraft({ ...draft, quote_text: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Notities</span>
              <textarea
                className="field textarea compact"
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>
          </section>

          <section className="panel">
            <div className="panel-title">Call en transcriptie</div>
            <label className="field-group">
              <span>Transcriptie</span>
              <textarea
                className="field textarea"
                value={draft.transcript}
                onChange={(event) => setDraft({ ...draft, transcript: event.target.value })}
              />
            </label>
          </section>

          <section className="panel">
            <div className="panel-title">Document</div>
            <label className="upload-box">
              <span>{uploading ? 'Uploaden...' : 'Kies offerte-document'}</span>
              <input type="file" onChange={uploadDocument} />
            </label>
            <label className="field-group">
              <span>Documentnaam</span>
              <input
                className="field"
                value={draft.proposal_document_name}
                onChange={(event) => setDraft({ ...draft, proposal_document_name: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Document url</span>
              <input
                className="field"
                value={draft.proposal_document_url}
                onChange={(event) => setDraft({ ...draft, proposal_document_url: event.target.value })}
              />
            </label>
            {draft.proposal_document_url ? (
              <a className="inline-link" href={draft.proposal_document_url} target="_blank" rel="noreferrer">
                Open gekoppeld document
              </a>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-title">Gmail opvolging</div>
            <div className="double-grid">
              <label className="field-group">
                <span>Gmail thread id</span>
                <input
                  className="field"
                  value={draft.gmail_thread_id}
                  onChange={(event) => setDraft({ ...draft, gmail_thread_id: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Laatste reply van</span>
                <input
                  className="field"
                  value={draft.gmail_last_sender}
                  onChange={(event) => setDraft({ ...draft, gmail_last_sender: event.target.value })}
                />
              </label>
            </div>
            <div className="double-grid">
              <label className="field-group">
                <span>Gmail thread url</span>
                <input
                  className="field"
                  value={draft.gmail_thread_url}
                  onChange={(event) => setDraft({ ...draft, gmail_thread_url: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Laatste reply datum</span>
                <input
                  type="datetime-local"
                  className="field"
                  value={draft.gmail_last_reply_at}
                  onChange={(event) => setDraft({ ...draft, gmail_last_reply_at: event.target.value })}
                />
              </label>
            </div>
            {draft.gmail_thread_url ? (
              <a className="inline-link" href={draft.gmail_thread_url} target="_blank" rel="noreferrer">
                Open Gmail thread
              </a>
            ) : null}
            <div className="event-list">
              {gmailEvents.length === 0 ? (
                <div className="empty-inline">Nog geen gelogde Gmail reply-events.</div>
              ) : (
                gmailEvents.map((event) => (
                  <div key={event.id} className="event-card">
                    <strong>{event.sender_name || event.sender_email || 'Onbekende afzender'}</strong>
                    <span>{formatDate(event.received_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <p>{event.subject || event.snippet || 'Geen onderwerp'}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel span-2">
            <div className="panel-title">Communicatie rondom offerte</div>
            <div className="double-grid">
              <label className="field-group">
                <span>Datum en tijd</span>
                <input
                  type="datetime-local"
                  className="field"
                  value={communicationDraft.occurred_at}
                  onChange={(event) => setCommunicationDraft({ ...communicationDraft, occurred_at: event.target.value })}
                />
              </label>
              <label className="field-group">
                <span>Vorm</span>
                <input
                  className="field"
                  placeholder="Belletje, mailtje, appje, LinkedIn DM..."
                  value={communicationDraft.channel}
                  onChange={(event) => setCommunicationDraft({ ...communicationDraft, channel: event.target.value })}
                />
              </label>
            </div>
            <div className="double-grid">
              <label className="field-group">
                <span>Wie</span>
                <select
                  className="field"
                  value={communicationDraft.actor}
                  onChange={(event) => setCommunicationDraft({ ...communicationDraft, actor: event.target.value })}
                >
                  <option value="ik">Ik</option>
                  <option value="klant">Klant</option>
                </select>
              </label>
              <label className="field-group">
                <span>Vervolgdatum</span>
                <input
                  type="date"
                  className="field"
                  value={communicationDraft.next_step_date}
                  onChange={(event) => setCommunicationDraft({ ...communicationDraft, next_step_date: event.target.value })}
                />
              </label>
            </div>
            <label className="field-group">
              <span>Inhoud</span>
              <textarea
                className="field textarea compact"
                placeholder="Wat is er gezegd, gevraagd of afgesproken?"
                value={communicationDraft.summary}
                onChange={(event) => setCommunicationDraft({ ...communicationDraft, summary: event.target.value })}
              />
            </label>
            <label className="field-group">
              <span>Vervolgstap</span>
              <input
                className="field"
                placeholder="Terugbellen, reminder sturen, demo plannen..."
                value={communicationDraft.next_step}
                onChange={(event) => setCommunicationDraft({ ...communicationDraft, next_step: event.target.value })}
              />
            </label>
            <div className="communication-actions">
              <button className="primary-button" type="button" onClick={saveCommunication} disabled={savingCommunication}>
                {savingCommunication ? 'Opslaan...' : 'Communicatie toevoegen'}
              </button>
            </div>
            <div className="communication-list">
              {communications.length === 0 ? (
                <div className="empty-inline">Nog geen communicatie gelogd.</div>
              ) : (
                communications.map((entry) => (
                  <div key={entry.id} className="communication-card">
                    <div className="communication-card-top">
                      <strong>{entry.channel}</strong>
                      <span>{formatDate(entry.occurred_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="communication-card-meta">
                      <span className={`status-pill ${entry.actor === 'klant' ? 'status-verloren' : 'status-intake'}`}>
                        {entry.actor === 'klant' ? 'Klant' : 'Ik'}
                      </span>
                      {entry.next_step ? <span>Volgende stap: {entry.next_step}</span> : null}
                      {entry.next_step_date ? <span>Op {formatDate(entry.next_step_date)}</span> : null}
                    </div>
                    <p>{entry.summary}</p>
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={() => deleteCommunication(entry.id)}
                    >
                      Verwijderen
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
        )}
      </main>
    </div>
  )
}
