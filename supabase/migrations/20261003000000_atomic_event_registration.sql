create or replace function public.register_event_batch(p_event_id uuid, p_rows jsonb)
returns table(ticket_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_row_count integer;
  v_registered_count bigint;
begin
  if pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using message = 'INVALID_BATCH', errcode = 'P0001';
  end if;

  v_row_count := pg_catalog.jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 100 then
    raise exception using message = 'INVALID_BATCH', errcode = 'P0001';
  end if;

  -- Serializes all registrations for this event until count and insert commit.
  select e.* into v_event
  from public.events as e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception using message = 'EVENT_NOT_FOUND', errcode = 'P0002';
  end if;

  if not v_event.registration_open
     or (v_event.registration_deadline is not null
         and v_event.registration_deadline <= (pg_catalog.now() at time zone 'UTC')) then
    raise exception using message = 'REGISTRATION_CLOSED', errcode = 'P0001';
  end if;

  if exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_rows) as item(row)
       where pg_catalog.jsonb_typeof(item.row) is distinct from 'object'
          or nullif(pg_catalog.btrim(item.row ->> 'name'), '') is null
          or pg_catalog.length(pg_catalog.btrim(item.row ->> 'name')) > 120
          or item.row ->> 'email' is null
          or pg_catalog.length(pg_catalog.btrim(item.row ->> 'email')) > 320
          or pg_catalog.btrim(item.row ->> 'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ) then
    raise exception using message = 'INVALID_BATCH', errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) as item(row)
    group by pg_catalog.lower(pg_catalog.btrim(item.row ->> 'email'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception using message = 'DUPLICATE_EMAIL', errcode = 'P0001';
  end if;

  if v_event.is_team_event then
    if v_row_count < greatest(coalesce(v_event.min_team_size, 1), 1)
       or (v_event.max_team_size is not null and v_event.max_team_size > 0
           and v_row_count > v_event.max_team_size)
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_rows) as item(row)
         where nullif(pg_catalog.btrim(item.row ->> 'team_name'), '') is null
           or pg_catalog.length(pg_catalog.btrim(item.row ->> 'team_name')) > 120
       )
       or (select pg_catalog.count(distinct pg_catalog.btrim(item.row ->> 'team_name'))
           from pg_catalog.jsonb_array_elements(p_rows) as item(row)) <> 1 then
      raise exception using message = 'TEAM_SIZE_INVALID', errcode = 'P0001';
    end if;
  elsif v_row_count <> 1 then
    raise exception using message = 'INVALID_BATCH', errcode = 'P0001';
  end if;

  select pg_catalog.count(*) into v_registered_count
  from public.registrations as r
  where r.event_id = p_event_id;

  if v_event.max_participants is not null and v_event.max_participants > 0
     and v_registered_count + v_row_count > v_event.max_participants then
    raise exception using message = 'CAPACITY_REACHED', errcode = 'P0001';
  end if;

  return query
    insert into public.registrations as inserted (
    event_id, ticket_id, team_name, is_team_leader, name, email, phone,
    roll_number, branch, year_of_study, section, college
  )
  select
    p_event_id,
    pg_catalog.gen_random_uuid(),
    nullif(pg_catalog.btrim(item.row ->> 'team_name'), ''),
    v_event.is_team_event and item.ordinality = 1,
    pg_catalog.btrim(item.row ->> 'name'),
    pg_catalog.lower(pg_catalog.btrim(item.row ->> 'email')),
    nullif(pg_catalog.btrim(item.row ->> 'phone'), ''),
    nullif(pg_catalog.btrim(item.row ->> 'roll_number'), ''),
    nullif(pg_catalog.btrim(item.row ->> 'branch'), ''),
    nullif(pg_catalog.btrim(item.row ->> 'year_of_study'), ''),
    nullif(pg_catalog.btrim(item.row ->> 'section'), ''),
    nullif(pg_catalog.btrim(item.row ->> 'college'), '')
  from pg_catalog.jsonb_array_elements(p_rows) with ordinality as item(row, ordinality)
  returning inserted.ticket_id;
end;
$$;

drop policy if exists "Public can register for open events" on public.registrations;

revoke all on function public.register_event_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_event_batch(uuid, jsonb) to service_role;

create or replace function public.get_event_registration_counts()
returns table(event_id uuid, registered_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.event_id, pg_catalog.count(*)::bigint
  from public.registrations as r
  group by r.event_id;
$$;

revoke all on function public.get_event_registration_counts() from public;
grant execute on function public.get_event_registration_counts() to anon, authenticated, service_role;
