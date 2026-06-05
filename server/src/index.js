import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const port = Number(process.env.PORT || 8787)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn verplicht.')
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'offerte-suite-server' })
})

app.post('/gmail/replies', async (request, response) => {
  const {
    quoteRequestId,
    gmailThreadId,
    gmailMessageId,
    senderEmail,
    senderName,
    subject,
    snippet,
    receivedAt,
    payload = {},
  } = request.body || {}

  if (!quoteRequestId) {
    response.status(400).json({ error: 'quoteRequestId is verplicht.' })
    return
  }

  const eventPayload = {
    quote_request_id: quoteRequestId,
    gmail_thread_id: gmailThreadId || null,
    gmail_message_id: gmailMessageId || null,
    sender_email: senderEmail || null,
    sender_name: senderName || null,
    subject: subject || null,
    snippet: snippet || null,
    received_at: receivedAt || new Date().toISOString(),
    payload,
  }

  const eventResult = await supabase.from('gmail_events').insert(eventPayload).select().single()
  if (eventResult.error) {
    response.status(500).json({ error: eventResult.error.message })
    return
  }

  const updateResult = await supabase
    .from('quote_requests')
    .update({
      gmail_thread_id: gmailThreadId || null,
      gmail_last_reply_at: eventPayload.received_at,
      gmail_last_sender: senderName || senderEmail || null,
      status: 'opvolgen',
    })
    .eq('id', quoteRequestId)
    .select()
    .single()

  if (updateResult.error) {
    response.status(500).json({
      error: updateResult.error.message,
      gmailEvent: eventResult.data,
    })
    return
  }

  response.status(201).json({
    gmailEvent: eventResult.data,
    quoteRequest: updateResult.data,
  })
})

app.listen(port, () => {
  console.log(`Offerte Suite server draait op poort ${port}`)
})
