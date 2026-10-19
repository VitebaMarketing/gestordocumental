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

-- ---------------------------------------------------------------------
-- Visibilidad de documentos (por empresa, grupo de usuarios o persona).
-- Un documento con visibility.mode = 'restricted' solo lo ven:
--   · quien lo subió y las personas de su circuito de firma (siempre),
--   · las personas indicadas, las de los grupos indicados y las de las
--     empresas indicadas (según el dominio de su correo).
-- Sus firmas, historial y archivos siguen la misma regla.
-- ---------------------------------------------------------------------
create or replace function public.doc_visible(doc jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me  text  := lower(coalesce(auth.jwt()->>'email', ''));
  dom text  := split_part(lower(coalesce(auth.jwt()->>'email', '')), '@', 2);
  vis jsonb := doc->'visibility';
begin
  if vis is null or coalesce(vis->>'mode', 'all') <> 'restricted' then return true; end if;
  if me = '' then return false; end if;
  if lower(coalesce(doc->>'createdBy', '')) = me then return true; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(doc->'versions', '[]'::jsonb)) v
    where lower(coalesce(v->>'uploadedBy', '')) = me
       or exists (
         select 1 from jsonb_array_elements(coalesce(v->'signers', '[]'::jsonb)) s
         where jsonb_typeof(s) = 'object' and (
               lower(coalesce(s->>'email', '')) = me
            or (jsonb_typeof(s->'members') = 'array'
                and exists (select 1 from jsonb_array_elements_text(s->'members') m where lower(m) = me)))
            or (jsonb_typeof(s) = 'string' and lower(s #>> '{}') = me))
  ) then return true; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(vis->'users', '[]'::jsonb)) u where lower(u) = me) then return true; end if;
  if exists (
    select 1 from public.records c
    where c.coll = 'companies'
      and c.id in (select jsonb_array_elements_text(coalesce(vis->'companies', '[]'::jsonb)))
      and dom = any (select trim(both ' @' from x) from unnest(regexp_split_to_array(lower(coalesce(c.data->>'domains', '')), '[,; ]+')) x)
  ) then return true; end if;
  if exists (
    select 1 from public.records g
    where g.coll = 'ugroups'
      and g.id in (select jsonb_array_elements_text(coalesce(vis->'groups', '[]'::jsonb)))
      and exists (select 1 from jsonb_array_elements_text(coalesce(g.data->'members', '[]'::jsonb)) m where lower(m) = me)
  ) then return true; end if;
  return false;
end $$;

create or replace function public.doc_visible_id(doc_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.doc_visible(r.data) from public.records r where r.coll = 'documents' and r.id = doc_id), true);
$$;

-- Cualquier persona que haya iniciado sesión ve catálogos, usuarios y circuitos;
-- los documentos (y sus firmas e historial) solo si su visibilidad lo permite.
create policy "leer registros" on public.records
  for select to authenticated using (
    case coll
      when 'documents'  then public.doc_visible(data)
      when 'signatures' then public.doc_visible_id(data->>'docId')
      when 'events'     then public.doc_visible_id(data->>'docId')
      else true
    end);

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

-- Los archivos de docs/<id-documento>/… siguen la visibilidad de su documento.
create policy "leer documentos" on storage.objects
  for select to authenticated using (
    bucket_id = 'documentos'
    and (split_part(name, '/', 1) <> 'docs' or public.doc_visible_id(split_part(name, '/', 2))));

-- Se pueden subir archivos nuevos, pero nunca sobrescribir ni borrar los existentes.
create policy "subir documentos" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos');

notify pgrst, 'reload schema';
