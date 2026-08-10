-- Bereket v1.19.0 — Paylaşılan kasalar
-- beebook (pdxnpnlwrtswwifevlil) projesine uygulandı: 10.08.2026
-- DİKKAT: bu proje 5 uygulama tarafından paylaşılır; yalnızca brkt_ önekli
-- nesnelere dokunulur. Eski public.brkt_data tablosu BİLİNÇLİ olarak silinmedi
-- (geri dönüş sigortası).

create table if not exists public.brkt_vaults(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.brkt_members(
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.brkt_vaults(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text not null,
  role text not null check (role in ('owner','editor','viewer')),
  status text not null check (status in ('pending','active')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz
);
create unique index if not exists brkt_members_vault_email_uq
  on public.brkt_members(vault_id, lower(email));
create index if not exists brkt_members_user_idx on public.brkt_members(user_id);

-- RLS özyineleme tuzağını kıran yardımcı: politikalar SADECE bunu kullanır,
-- tablolara doğrudan bakmaz (aksi halde sonsuz özyineleme hatası alınır).
create or replace function public.brkt_role(v uuid) returns text
language sql security definer stable set search_path = public as $$
  select m.role from public.brkt_members m
   where m.vault_id = v and m.user_id = auth.uid() and m.status = 'active'
   limit 1
$$;

-- Davetin bağlanması: JWT e-postasıyla eşleşen bekleyen davetleri sahiplen
create or replace function public.brkt_claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int; em text;
begin
  em := lower(coalesce(auth.jwt() ->> 'email',''));
  if em = '' then return 0; end if;
  update public.brkt_members
     set user_id = auth.uid(), status = 'active', joined_at = now()
   where user_id is null and lower(email) = em;
  get diagnostics n = row_count;
  return n;
end $$;

alter table public.brkt_vaults enable row level security;
alter table public.brkt_members enable row level security;

drop policy if exists brkt_vaults_sel on public.brkt_vaults;
-- NOT (10.08.2026 düzeltmesi): owner_id kolu ZORUNLU. PostgREST'in
-- Prefer: return=representation kullanması INSERT'e RETURNING ekler ve
-- RETURNING satırı SELECT politikasına tabidir; yeni kasada henüz brkt_members
-- satırı olmadığından brkt_role() null döner, satır okunamaz ve PostgreSQL bunu
-- "new row violates row-level security policy" olarak bildirir. Bu yüzden kasa
-- oluşturma tamamen başarısız oluyordu. Sahip kendi kasasını her zaman görür.
create policy brkt_vaults_sel on public.brkt_vaults for select to authenticated
  using (public.brkt_role(id) is not null or owner_id = auth.uid());

drop policy if exists brkt_vaults_ins on public.brkt_vaults;
create policy brkt_vaults_ins on public.brkt_vaults for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists brkt_vaults_upd on public.brkt_vaults;
create policy brkt_vaults_upd on public.brkt_vaults for update to authenticated
  using (public.brkt_role(id) in ('owner','editor'))
  with check (public.brkt_role(id) in ('owner','editor'));

drop policy if exists brkt_vaults_del on public.brkt_vaults;
create policy brkt_vaults_del on public.brkt_vaults for delete to authenticated
  using (public.brkt_role(id) = 'owner');

drop policy if exists brkt_members_sel on public.brkt_members;
create policy brkt_members_sel on public.brkt_members for select to authenticated
  using (public.brkt_role(vault_id) is not null or user_id = auth.uid());

-- exists kolu yumurta-tavuk durumunu çözer: yeni kasada henüz üyelik satırı
-- yoktur, brkt_role() null döner ve sahip kendi owner kaydını yazamaz.
drop policy if exists brkt_members_ins on public.brkt_members;
create policy brkt_members_ins on public.brkt_members for insert to authenticated
  with check (public.brkt_role(vault_id) = 'owner'
              or exists (select 1 from public.brkt_vaults v
                          where v.id = vault_id and v.owner_id = auth.uid()));

drop policy if exists brkt_members_upd on public.brkt_members;
create policy brkt_members_upd on public.brkt_members for update to authenticated
  using (public.brkt_role(vault_id) = 'owner')
  with check (public.brkt_role(vault_id) = 'owner');

-- Sahip herkesi çıkarabilir; üye kendi satırını silebilir ("kasadan ayrıl"),
-- ama sahip kendi satırını silemez (önce devretmeli) — kasa sahipsiz kalmasın.
drop policy if exists brkt_members_del on public.brkt_members;
create policy brkt_members_del on public.brkt_members for delete to authenticated
  using ( (public.brkt_role(vault_id) = 'owner' and role <> 'owner')
          or (user_id = auth.uid() and role <> 'owner') );

grant select, insert, update, delete on public.brkt_vaults to authenticated;
grant select, insert, update, delete on public.brkt_members to authenticated;

-- Bu iki fonksiyon yalnızca giriş yapmış kullanıcıya lazım; anon kapatılır.
revoke execute on function public.brkt_role(uuid) from anon, public;
revoke execute on function public.brkt_claim_invites() from anon, public;
grant execute on function public.brkt_role(uuid) to authenticated;
grant execute on function public.brkt_claim_invites() to authenticated;

-- Realtime: RLS filtreli postgres_changes için tam replica identity gerekir
alter table public.brkt_vaults replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'brkt_vaults'
  ) then
    alter publication supabase_realtime add table public.brkt_vaults;
  end if;
end $$;
