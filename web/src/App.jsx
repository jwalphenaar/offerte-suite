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

function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('nl-NL', options)
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

export default function App() {
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('alles')
  const [gmailEvents, setGmailEvents] = useState([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadItems()
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setGmailEvents([])
      return
    }
    loadGmailEvents(selectedId)
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

  function normalizeDraft(item) {
    return {
      ...emptyDraft(),
      ...item,
      request_date: item.request_date || '',
      quote_date: item.quote_date || '',
      call_date: item.call_date ? item.call_date.slice(0, 16) : '',
      gmail_last_reply_at: item.gmail_last_reply_at ? item.gmail_last_reply_at.slice(0, 16) : '',
      follow_up_date: item.follow_up_date || '',
    }
  }

  function selectItem(item) {
    setSelectedId(item.id)
    setDraft(normalizeDraft(item))
    setMessage('')
  }

  function startNew() {
    setSelectedId(null)
    setDraft(emptyDraft())
    setGmailEvents([])
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

  const openItems = items.filter((item) => isOpenStatus(item.status))
  const followUpItems = openItems.filter((item) => getUrgency(item) === 'overdue' || getUrgency(item) === 'soon')
  const sentQuotes = items.filter((item) => ['offerte_verstuurd', 'wacht_op_klant', 'opvolgen'].includes(item.status))
  const wonItems = items.filter((item) => item.status === 'gewonnen')

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
                <span>{statusOptions.find((option) => option.value === item.status)?.label || item.status}</span>
              </div>
              <div className="request-item-meta">
                <span>{item.request_type || 'Geen type'}</span>
                <span>{item.request_source || 'Geen bron'}</span>
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
            <div className="eyebrow">Offertedossier</div>
            <h2>{selectedId ? draft.company_name || 'Nieuwe aanvraag' : 'Nieuwe aanvraag'}</h2>
          </div>
          <div className="header-actions">
            {selectedId ? <button className="ghost-button" onClick={deleteItem}>Verwijderen</button> : null}
            <button className="primary-button" onClick={saveItem} disabled={saving}>
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>

        {message ? <div className="feedback-banner">{message}</div> : null}

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
        </div>
      </main>
    </div>
  )
}
