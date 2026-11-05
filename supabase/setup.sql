-- Bibliophile – Datenbank für "Die Leseratten"
-- Einmal komplett im Supabase SQL Editor ausführen (Projekt egal, gern dasselbe wie Kinozettel).
-- Das Skript kann gefahrlos mehrfach laufen.
-- Ganz unten stehen die Namen der Mitglieder: vorher anpassen.

-- ---------- Tabellen ----------
create table if not exists bib_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  created_at timestamptz not null default now()
);

create table if not exists bib_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text not null default '',
  blurb text not null default '',
  cover text not null default '',
  isbn text not null default '',
  note text not null default '',
  status text not null default 'list' check (status in ('list','reading','read','removed')),
  added_by uuid references bib_members(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists bib_votes (
  book_id uuid not null references bib_books(id) on delete cascade,
  member_id uuid not null references bib_members(id) on delete cascade,
  primary key (book_id, member_id)
);

create table if not exists bib_ratings (
  book_id uuid not null references bib_books(id) on delete cascade,
  member_id uuid not null references bib_members(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  primary key (book_id, member_id)
);

create table if not exists bib_dates (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  place text not null default '',
  note text not null default '',
  fixed boolean not null default false,
  created_by uuid references bib_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists bib_answers (
  date_id uuid not null references bib_dates(id) on delete cascade,
  member_id uuid not null references bib_members(id) on delete cascade,
  answer text not null check (answer in ('yes','maybe','no')),
  primary key (date_id, member_id)
);

-- Kein direkter Zugriff von außen: alles läuft über die bib_*-Funktionen.
alter table bib_members enable row level security;
alter table bib_books   enable row level security;
alter table bib_votes   enable row level security;
alter table bib_ratings enable row level security;
alter table bib_dates   enable row level security;
alter table bib_answers enable row level security;
revoke all on bib_members, bib_books, bib_votes, bib_ratings, bib_dates, bib_answers from anon, authenticated;

-- ---------- Funktionen ----------
create or replace function bib_who(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from bib_members where token = p_token;
  if v is null then raise exception 'Ungültiger Link'; end if;
  return v;
end $$;

create or replace function bib_me(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  return json_build_object(
    'me', (select json_build_object('id', id, 'name', name) from bib_members where id = v),
    'members', (select coalesce(json_agg(json_build_object('id', id, 'name', name) order by created_at, name), '[]'::json) from bib_members),
    'books', (select coalesce(json_agg(json_build_object(
        'id', b.id, 'title', b.title, 'authors', b.authors, 'blurb', b.blurb, 'cover', b.cover,
        'isbn', b.isbn, 'note', b.note, 'status', b.status, 'added_by', b.added_by,
        'created_at', b.created_at, 'read_at', b.read_at,
        'votes', (select coalesce(json_agg(x.member_id), '[]'::json) from bib_votes x where x.book_id = b.id),
        'ratings', (select coalesce(json_object_agg(r.member_id, r.stars), '{}'::json) from bib_ratings r where r.book_id = b.id)
      ) order by b.created_at desc), '[]'::json) from bib_books b where b.status <> 'removed'),
    'dates', (select coalesce(json_agg(json_build_object(
        'id', d.id, 'starts_at', d.starts_at, 'place', d.place, 'note', d.note, 'fixed', d.fixed,
        'created_by', d.created_by,
        'answers', (select coalesce(json_object_agg(a.member_id, a.answer), '{}'::json) from bib_answers a where a.date_id = d.id)
      ) order by d.starts_at), '[]'::json) from bib_dates d where d.starts_at > now() - interval '12 hours')
  );
end $$;

create or replace function bib_add_book(p_token text, p_title text, p_authors text, p_blurb text, p_cover text, p_isbn text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token); b uuid;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'Titel fehlt'; end if;
  if length(coalesce(p_cover, '')) > 400000 then raise exception 'Foto ist zu groß'; end if;
  select id into b from bib_books
   where status <> 'removed'
     and ((coalesce(p_isbn, '') <> '' and isbn = p_isbn) or lower(trim(title)) = lower(trim(p_title)))
   limit 1;
  if b is not null then raise exception 'Das Buch steht schon in der Liste'; end if;
  insert into bib_books (title, authors, blurb, cover, isbn, note, added_by)
  values (trim(p_title), coalesce(p_authors, ''), coalesce(p_blurb, ''), coalesce(p_cover, ''), coalesce(p_isbn, ''), coalesce(p_note, ''), v)
  returning id into b;
  insert into bib_votes (book_id, member_id) values (b, v);
  return b;
end $$;

create or replace function bib_update_book(p_token text, p_book uuid, p_blurb text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  update bib_books set blurb = coalesce(p_blurb, blurb), note = coalesce(p_note, note) where id = p_book;
end $$;

create or replace function bib_set_status(p_token text, p_book uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  if p_status not in ('list','reading','read','removed') then raise exception 'Unbekannter Status'; end if;
  if p_status = 'reading' then
    update bib_books set status = 'list' where status = 'reading' and id <> p_book;
  end if;
  update bib_books
     set status = p_status,
         read_at = case when p_status = 'read' then coalesce(read_at, now()) when p_status = 'list' then null else read_at end
   where id = p_book;
end $$;

create or replace function bib_vote(p_token text, p_book uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  if p_on then
    insert into bib_votes (book_id, member_id) values (p_book, v) on conflict do nothing;
  else
    delete from bib_votes where book_id = p_book and member_id = v;
  end if;
end $$;

create or replace function bib_rate(p_token text, p_book uuid, p_stars int) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  if coalesce(p_stars, 0) = 0 then
    delete from bib_ratings where book_id = p_book and member_id = v;
  else
    insert into bib_ratings (book_id, member_id, stars) values (p_book, v, p_stars)
    on conflict (book_id, member_id) do update set stars = excluded.stars;
  end if;
end $$;

create or replace function bib_add_date(p_token text, p_at timestamptz, p_place text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token); d uuid;
begin
  insert into bib_dates (starts_at, place, note, created_by)
  values (p_at, coalesce(p_place, ''), coalesce(p_note, ''), v) returning id into d;
  insert into bib_answers (date_id, member_id, answer) values (d, v, 'yes');
  return d;
end $$;

create or replace function bib_answer(p_token text, p_date uuid, p_answer text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  if coalesce(p_answer, '') = '' then
    delete from bib_answers where date_id = p_date and member_id = v;
  else
    insert into bib_answers (date_id, member_id, answer) values (p_date, v, p_answer)
    on conflict (date_id, member_id) do update set answer = excluded.answer;
  end if;
end $$;

create or replace function bib_fix_date(p_token text, p_date uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  if p_on then update bib_dates set fixed = false where fixed and id <> p_date; end if;
  update bib_dates set fixed = p_on where id = p_date;
end $$;

create or replace function bib_delete_date(p_token text, p_date uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := bib_who(p_token);
begin
  delete from bib_dates where id = p_date;
end $$;

-- ---------- Rechte ----------
revoke execute on function bib_who(text) from public, anon, authenticated;
grant execute on function
  bib_me(text),
  bib_add_book(text, text, text, text, text, text, text),
  bib_update_book(text, uuid, text, text),
  bib_set_status(text, uuid, text),
  bib_vote(text, uuid, boolean),
  bib_rate(text, uuid, int),
  bib_add_date(text, timestamptz, text, text),
  bib_answer(text, uuid, text),
  bib_fix_date(text, uuid, boolean),
  bib_delete_date(text, uuid)
to anon;

-- ---------- Mitglieder ----------
-- Namen hier anpassen. Neue Namen kommen dazu, bestehende bleiben (mit ihrem Link).
insert into bib_members (name)
select n from unnest(array['Jan', 'Nachbarin 1', 'Nachbarin 2']) as n
on conflict (name) do nothing;

-- Die persönlichen Links (jede bekommt nur ihren eigenen):
select name, 'https://brockmann-director.github.io/bibliophile/?k=' || token as link
from bib_members order by created_at, name;
