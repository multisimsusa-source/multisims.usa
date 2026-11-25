-- 25 Nov: photos and videos on a support ticket, from both sides. The customer (order page),
-- the dealer (portal) and staff (ticket page) add files while the issue is being solved, and
-- everyone on the ticket sees them. Files go straight from the browser to private storage on
-- a one-time signed upload link (a phone video is too big for a server request); the server
-- then checks the stored file and records it here. Signed links only, never public.

create table public.ticket_files (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  kind text not null check (kind in ('image', 'video')),
  -- Who added it, as the other side sees it.
  added_by text not null check (added_by in ('customer', 'staff')),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ticket_files_ticket_idx on public.ticket_files (ticket_id, created_at);

alter table public.ticket_files enable row level security;

-- Writes go through the server (service role) after it checks who may add to the ticket.
create policy "ticket_files: staff read" on public.ticket_files
  for select to authenticated using (public.is_staff());
create policy "ticket_files: dealer read own" on public.ticket_files
  for select to authenticated using (
    exists (
      select 1
        from public.tickets t
        join public.orders o on o.id = t.order_id
       where t.id = ticket_id and o.dealer_id = auth.uid()
    )
  );

-- Photos up to 10 MB and videos up to 50 MB: the per-type limit is checked by the server,
-- the bucket holds the hard ceiling and the allowed types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-files', 'ticket-files', false, 52428800,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A file from the customer or dealer rings in the staff portal; one from support tells the
-- dealer in theirs (website customers see it on their order page).
create or replace function public.notifications_on_ticket_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_order public.orders;
  v_what text := case when new.kind = 'video' then 'video' else 'photo' end;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  select * into v_order from public.orders where id = v_ticket.order_id;
  if new.added_by = 'customer' then
    perform public.notify_staff('ticket_file', 'New ' || v_what || ' on ticket #' || v_ticket.number,
      'MS-' || v_order.number || ', ' || v_ticket.type_name, '/agent/tickets/' || v_ticket.id);
  elsif v_order.dealer_id is not null then
    perform public.notify_user(v_order.dealer_id, 'ticket_file', 'New ' || v_what || ' on ticket #' || v_ticket.number,
      v_ticket.type_name, '/dealer/tickets#t-' || v_ticket.number);
  end if;
  return new;
end;
$$;

revoke all on function public.notifications_on_ticket_file() from public, anon, authenticated;

create trigger ticket_files_notify
  after insert on public.ticket_files
  for each row execute function public.notifications_on_ticket_file();
