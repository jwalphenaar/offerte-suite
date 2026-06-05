# Offerte Suite

Zelfstandige offerte-app voor je eigen aanvragen, los van de bestaande codebase.

## Wat zit erin

- React/Vite webapp in `web/`
- Supabase als database en documentopslag
- Railway-ready Node backend in `server/` voor Gmail reply webhooks
- Vercel-config voor de frontend
- SQL-schema in `supabase/schema.sql`

## Functionaliteit

- Offerte-aanvragen bijhouden met bedrijf, contact, bron, type aanvraag en notities
- Statusflow voor nieuw, call, offerte verstuurd, wachten op klant, opvolgen, gewonnen, verloren
- Follow-up datum en dashboard met openstaande acties
- Offertetekst en transcriptie opslaan
- Document uploaden naar Supabase Storage
- Gmail thread-url en reply-events registreren

## Supabase setup

1. Maak een nieuw Supabase project aan.
2. Voer `supabase/schema.sql` uit in de SQL editor.
3. Maak env-bestanden aan op basis van:
   - `web/.env.example`
   - `server/.env.example`

## Lokaal draaien

```bash
cd offerte-suite
npm install
npm run dev:web
```

In een tweede terminal:

```bash
cd offerte-suite
npm run dev:server
```

## Deploy

### GitHub

- Maak een nieuwe repository aan en push alleen de map `offerte-suite` of verplaats deze map naar een losse repo.

### Vercel

- Root directory: `offerte-suite`
- Build command: `npm run build:web`
- Output directory: `web/dist`
- Environment variables: dezelfde als in `web/.env.example`

### Railway

- Root directory: `offerte-suite`
- Start command: `npm --workspace server run start`
- Environment variables: dezelfde als in `server/.env.example`
- Vereist minimaal `SUPABASE_URL` en `SUPABASE_SERVICE_KEY`

## Gmail integratie

De backend bevat een webhook-endpoint om Gmail replies in Supabase weg te schrijven. Voor echte automatische Gmail-sync heb je nog OAuth credentials of forwarding/webhook-logica nodig aan Gmail-zijde.
