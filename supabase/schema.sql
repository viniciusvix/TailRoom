-- Execute este script no SQL Editor do Supabase.
-- O script é idempotente: pode ser executado novamente sem perder dados.
-- Modelo multiusuário: cada usuário só enxerga e altera os próprios dados (RLS).

-- ---------------------------------------------------------------------------
-- Função utilitária: mantém updated_at atualizado
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: um registro por usuário de auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- O perfil é criado pelo trigger handle_new_user; o cliente não insere.
drop policy if exists "Users can create their own profile" on public.profiles;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Remove o trigger/função antigos (nome específico de profiles).
drop trigger if exists profiles_updated_at on public.profiles;
drop function if exists public.set_profile_updated_at();

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_settings: preferências de visualização de cada usuário
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level text not null default 'ALL' check (level in ('ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG')),
  case_sensitive boolean not null default false,
  show_line_numbers boolean not null default true,
  wrap_lines boolean not null default false,
  follow boolean not null default true,
  search_terms text[] not null default '{}' check (cardinality(search_terms) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can read their own settings" on public.user_settings;
create policy "Users can read their own settings"
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own settings" on public.user_settings;
create policy "Users can create their own settings"
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- log_sources: URLs remotas abertas por cada usuário (histórico persistente)
-- Arquivos locais não são salvos: o navegador não permite reabri-los
-- a partir de outro dispositivo, e o conteúdo nunca sai da máquina.
-- ---------------------------------------------------------------------------
create table if not exists public.log_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 300),
  url text not null check (url ~* '^https?://' and char_length(url) <= 2048),
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists log_sources_user_recent_idx
  on public.log_sources (user_id, last_opened_at desc);

alter table public.log_sources enable row level security;

drop policy if exists "Users can read their own sources" on public.log_sources;
create policy "Users can read their own sources"
  on public.log_sources for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own sources" on public.log_sources;
create policy "Users can create their own sources"
  on public.log_sources for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own sources" on public.log_sources;
create policy "Users can update their own sources"
  on public.log_sources for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sources" on public.log_sources;
create policy "Users can delete their own sources"
  on public.log_sources for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Novo usuário (Google ou e-mail/senha): cria perfil e preferências
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil sincronizado quando o usuário troca de e-mail.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_user_email_change();

-- Funções de trigger não devem ser chamadas pela API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: usuários criados antes deste script
-- ---------------------------------------------------------------------------
insert into public.profiles (id, display_name, avatar_url, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url',
  u.email
from auth.users u
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Permissões: somente usuários autenticados acessam as tabelas (sempre via RLS)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.user_settings, public.log_sources from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update, delete on public.log_sources to authenticated;

-- Nunca exponha a service_role key no frontend. A anon key fica protegida por RLS.
