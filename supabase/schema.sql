-- =====================================================================
--  Circuito de firmas · Gafial Group — estructura de Supabase
--  Pégalo en Supabase → SQL Editor → New query → Run (una sola vez).
-- =====================================================================

-- Tabla única de registros (usuarios, circuitos, catálogos, documentos,
-- firmas y eventos). Cada fila es un objeto JSON identificado por colección + id.
create table if not exists public.records (
  coll        text        not null,
  id          text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (coll, id)
);

alter table public.records enable row level security;

drop policy if exists "leer registros"       on public.records;
drop policy if exists "crear registros"      on public.records;
drop policy if exists "modificar registros"  on public.records;
drop policy if exists "borrar registros"     on public.records;

-- Cualquier persona que haya iniciado sesión puede ver todo.
create policy "leer registros" on public.records
  for select to authenticated using (true);

-- Todos pueden crear y editar catálogos, circuitos, usuarios y documentos.
-- Una FIRMA solo la puede registrar la propia persona (su correo de acceso).
create policy "crear registros" on public.records
  for insert to authenticated
  with check (coll <> 'signatures' or lower(data->>'email') = lower(auth.jwt()->>'email'));

-- Las firmas y el historial no se pueden modificar una vez guardados.
create policy "modificar registros" on public.records
  for update to authenticated
  using (coll not in ('signatures', 'events'))
  with check (coll not in ('signatures', 'events'));

-- Las firmas y el historial no se pueden borrar.
create policy "borrar registros" on public.records
  for delete to authenticated
  using (coll not in ('signatures', 'events', 'documents'));

-- Almacenamiento privado de los archivos subidos a firma.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "leer documentos"  on storage.objects;
drop policy if exists "subir documentos" on storage.objects;

create policy "leer documentos" on storage.objects
  for select to authenticated using (bucket_id = 'documentos');

-- Se pueden subir archivos nuevos, pero nunca sobrescribir ni borrar los existentes.
create policy "subir documentos" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos');
