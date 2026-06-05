create extension if not exists pgcrypto;

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  request_type text,
  request_source text,
  request_date date not null default current_date,
  call_date timestamptz,
  transcript text,
  quote_date date,
  quote_text text,
  proposal_document_name text,
  proposal_document_path text,
  proposal_document_url text,
  gmail_thread_id text,
  gmail_thread_url text,
  gmail_last_reply_at timestamptz,
  gmail_last_sender text,
  status text not null default 'nieuw',
  follow_up_date date,
  next_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmail_events (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  gmail_thread_id text,
  gmail_message_id text,
  sender_email text,
  sender_name text,
  subject text,
  snippet text,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quote_requests_set_updated_at on public.quote_requests;
create trigger quote_requests_set_updated_at
before update on public.quote_requests
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('quote-documents', 'quote-documents', true)
on conflict (id) do nothing;

alter table public.quote_requests enable row level security;
alter table public.gmail_events enable row level security;

drop policy if exists "quote requests open access" on public.quote_requests;
create policy "quote requests open access"
on public.quote_requests
for all
using (true)
with check (true);

drop policy if exists "gmail events open access" on public.gmail_events;
create policy "gmail events open access"
on public.gmail_events
for all
using (true)
with check (true);

drop policy if exists "public quote documents" on storage.objects;
create policy "public quote documents"
on storage.objects
for all
using (bucket_id = 'quote-documents')
with check (bucket_id = 'quote-documents');
