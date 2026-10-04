create or replace function public.register_founders_expo_stall(p_event_id uuid, p_row jsonb)
returns table(ticket_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_team_size integer;
  v_members jsonb;
  v_ticket_id uuid := pg_catalog.gen_random_uuid();
begin
  select e.* into v_event
  from public.events as e
  where e.id = p_event_id and e.slug = 'founders-expo-26'
  for update;

  if not found then
    raise exception using message = 'EVENT_NOT_FOUND', errcode = 'P0002';
  end if;
  if not v_event.registration_open
     or (v_event.registration_deadline is not null
         and v_event.registration_deadline <= (pg_catalog.now() at time zone 'UTC')) then
    raise exception using message = 'REGISTRATION_CLOSED', errcode = 'P0001';
  end if;

  v_team_size := (p_row #>> '{extra_data,team_size}')::integer;
  v_members := p_row #> '{extra_data,member_names}';
  if pg_catalog.jsonb_typeof(p_row) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_members) is distinct from 'array'
     or v_team_size not between 1 and 3
     or pg_catalog.jsonb_array_length(v_members) <> v_team_size - 1
     or p_row #>> '{extra_data,single_idea_per_stall}' is distinct from 'true'
     or nullif(pg_catalog.btrim(p_row ->> 'name'), '') is null
     or pg_catalog.length(p_row ->> 'name') > 120
     or nullif(pg_catalog.btrim(p_row ->> 'email'), '') is null
     or (p_row ->> 'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(pg_catalog.btrim(p_row ->> 'phone'), '') is null
     or nullif(pg_catalog.btrim(p_row ->> 'year_of_study'), '') is null
     or nullif(pg_catalog.btrim(p_row ->> 'branch'), '') is null
     or nullif(pg_catalog.btrim(p_row ->> 'section'), '') is null
     or nullif(pg_catalog.btrim(p_row ->> 'college'), '') is null
     or nullif(pg_catalog.btrim(p_row ->> 'team_name'), '') is null
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_members) as member(value)
                where pg_catalog.jsonb_typeof(member.value) <> 'string'
                   or nullif(pg_catalog.btrim(member.value #>> '{}'), '') is null
                   or pg_catalog.length(member.value #>> '{}') > 120) then
    raise exception using message = 'INVALID_STALL', errcode = 'P0001';
  end if;

  if v_event.max_participants is not null and v_event.max_participants > 0
     and (select pg_catalog.count(*) from public.registrations r where r.event_id = p_event_id)
         >= v_event.max_participants then
    raise exception using message = 'CAPACITY_REACHED', errcode = 'P0001';
  end if;

  return query
  insert into public.registrations (
    event_id, ticket_id, team_name, is_team_leader, name, email, phone,
    branch, year_of_study, section, college, extra_data
  ) values (
    p_event_id, v_ticket_id, pg_catalog.btrim(p_row ->> 'team_name'), true,
    pg_catalog.btrim(p_row ->> 'name'), pg_catalog.lower(pg_catalog.btrim(p_row ->> 'email')),
    pg_catalog.btrim(p_row ->> 'phone'), pg_catalog.btrim(p_row ->> 'branch'),
    pg_catalog.btrim(p_row ->> 'year_of_study'), pg_catalog.btrim(p_row ->> 'section'),
    pg_catalog.btrim(p_row ->> 'college'), p_row -> 'extra_data'
  ) returning registrations.ticket_id;
exception when unique_violation then
  raise exception using message = 'DUPLICATE_EMAIL', errcode = 'P0001';
end;
$$;

revoke all on function public.register_founders_expo_stall(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_founders_expo_stall(uuid, jsonb) to service_role;

insert into public.events (
  title, slug, short_description, long_description, date, time, venue, mode,
  poster_url, event_type, status, registration_open, registration_deadline,
  max_participants, requirements, prerequisites, is_paid, price, payment_link,
  is_featured, is_team_event, min_team_size, max_team_size, whatsapp_group_link
) values (
  'Founders Expo ''26',
  'founders-expo-26',
  'Showcase a startup or raw idea, collect feedback, and meet potential teammates.',
  'Founders Expo ’26 is a platform for anyone to present a startup or idea at any stage, from a raw idea to an established venture. Each registered idea or startup receives one stall. Students and faculty can share feedback through review cards and may express interest in joining your team. A registered startup is not required.',
  date '2026-10-13', time '09:20:00', 'C Block, Ground Floor, Seminar Hall', 'offline',
  '', 'expo', 'upcoming', true, timestamp '2026-10-12 18:29:00',
  null,
  'Entry fee: ₹149 per startup/idea. Teams may have up to 3 members; individuals are welcome. One stall can represent only one idea/startup. Pay the fixed ₹149 fee using the QR code shown on the registration page.',
  'Open to students, faculty, and others with an idea or startup at any stage, including raw ideas.',
  true, 149, null, false, true, 1, 3,
  'https://chat.whatsapp.com/HwVDt3NMVvK5xYxETbwMcm'
)
on conflict (slug) do nothing;
