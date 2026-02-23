create table if not exists public.training_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.training_state enable row level security;

drop policy if exists "Users can read own training state" on public.training_state;
create policy "Users can read own training state"
on public.training_state
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own training state" on public.training_state;
create policy "Users can insert own training state"
on public.training_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own training state" on public.training_state;
create policy "Users can update own training state"
on public.training_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
