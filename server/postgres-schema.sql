create table if not exists expenses (
  id bigint generated always as identity primary key,
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category text not null,
  due_date text not null,
  month text not null,
  paid boolean not null default false,
  paid_date text,
  recurring_id text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_expenses_month
  on expenses (month, due_date);

create unique index if not exists idx_expenses_recurring_month
  on expenses (recurring_id, month)
  where recurring_id is not null;

create table if not exists recurring_expenses (
  id text primary key,
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category text not null,
  due_day integer not null check (due_day between 1 and 31),
  start_month text not null,
  active boolean not null default true,
  created_at text not null
);

create table if not exists skipped_months (
  recurring_id text not null,
  month text not null,
  primary key (recurring_id, month)
);

create table if not exists share_links (
  token text primary key,
  created_at text not null
);

alter table expenses enable row level security;
alter table recurring_expenses enable row level security;
alter table skipped_months enable row level security;
alter table share_links enable row level security;
