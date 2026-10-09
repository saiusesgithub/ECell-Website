export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { createTicketAccessToken } from '../../lib/ticketAccess.js';
import { sendFoundersExpoNotifications } from '../../lib/foundersExpoMail.js';

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_ATTENDEES = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const optionalText = (value: unknown, field: string, maxLength = 200) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${field} is too long.`);
  return cleaned || null;
};

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: 'Registration request is too large.' }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid registration request.' }, 400);
  }

  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId) || rows.length === 0) {
    return json({ error: 'Missing or invalid registration details.' }, 400);
  }
  if (rows.length > MAX_ATTENDEES) {
    return json({ error: `A registration can include at most ${MAX_ATTENDEES} attendees.` }, 400);
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, slug, is_team_event, min_team_size, max_team_size')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) return json({ error: 'Could not load event settings.' }, 500);
  if (!event) return json({ error: 'Event not found.' }, 404);

  if (event.slug === 'founders-expo-26') {
    if (rows.length !== 1) return json({ error: 'Submit exactly one registration per stall.' }, 400);
    const row = rows[0];
    try {
      const teamSize = Number(row?.extra_data?.team_size);
      const submittedMembers = row?.extra_data?.members;
      const teamName = optionalText(row?.team_name, 'Idea or startup name', 120);
      if (!teamName || !Number.isInteger(teamSize) || teamSize < 1 || teamSize > 3 ||
          !Array.isArray(submittedMembers) || submittedMembers.length !== teamSize - 1 ||
          row?.extra_data?.single_idea_per_stall !== true) {
        return json({ error: 'Provide the idea name, valid team details, and one-idea-per-stall confirmation.' }, 400);
      }
      const name = optionalText(row.name, 'Name', 120);
      const email = optionalText(row.email, 'Email', 320)?.toLowerCase() ?? null;
      if (!name || !email || !EMAIL_PATTERN.test(email) || !optionalText(row.phone, 'Phone', 40) ||
          !optionalText(row.year_of_study, 'Year', 40) || !optionalText(row.branch, 'Branch', 80) ||
          !optionalText(row.section, 'Section', 40) || !optionalText(row.college, 'College')) {
        return json({ error: 'Complete all required lead and organization details.' }, 400);
      }
      const members = submittedMembers.map((member: any) => {
        if (!member || typeof member !== 'object' || Array.isArray(member)) throw new Error('Invalid teammate details.');
        const clean = {
          name: optionalText(member.name, 'Teammate name', 120),
          email: optionalText(member.email, 'Teammate email', 320)?.toLowerCase() ?? null,
          phone: optionalText(member.phone, 'Teammate phone', 40),
          year_of_study: optionalText(member.year_of_study, 'Teammate year', 40),
          branch: optionalText(member.branch, 'Teammate branch', 80),
          section: optionalText(member.section, 'Teammate section', 40),
          college: optionalText(member.college, 'Teammate college', 200),
        };
        if (Object.values(clean).some((value) => !value) || !EMAIL_PATTERN.test(clean.email ?? '')) {
          throw new Error('Complete all required details for every teammate.');
        }
        return clean;
      });
      if (new Set([email, ...members.map((member) => member.email)]).size !== teamSize) {
        return json({ error: 'Every team member must use a different email address.' }, 400);
      }
      const { data: registrations, error } = await supabaseAdmin.rpc('register_founders_expo_stall', {
        p_event_id: eventId,
        p_row: {
          name, email, phone: row.phone.trim(), year_of_study: row.year_of_study.trim(),
          branch: row.branch.trim(), section: row.section.trim(), college: row.college.trim(),
          team_name: teamName,
          extra_data: { form_variant: 'founders-expo', team_size: teamSize,
            members, member_names: members.map((member) => member.name),
            single_idea_per_stall: true },
        },
      });
      if (error) {
        if (error.message.includes('REGISTRATION_CLOSED')) return json({ error: 'Registration has closed for this event.' }, 409);
        if (error.message.includes('CAPACITY_REACHED')) return json({ error: 'All available stalls have been registered.' }, 409);
        if (error.message.includes('INVALID_STALL')) return json({ error: 'The stall details are invalid. Check the team size and required fields.' }, 400);
        if (error.message.includes('DUPLICATE_EMAIL') || error.code === '23505') return json({ code: '23505', error: 'This email is already registered for the event.' }, 409);
        if (error.message.includes('EVENT_NOT_FOUND')) return json({ error: 'Event not found.' }, 404);
        console.error('Founders Expo registration failed:', error.code, error.message);
        return json({ error: 'Could not complete registration.' }, 500);
      }
      const ticketId = registrations?.[0]?.ticket_id;
      if (!ticketId) return json({ error: 'Registration saved, but confirmation is unavailable. Contact the organizers.' }, 500);
      const { data: savedRegistration } = await supabaseAdmin.from('registrations')
        .select('id').eq('ticket_id', ticketId).single();
      let ticketEmailSent = false;
      if (savedRegistration?.id) {
        try {
          const delivery = await sendFoundersExpoNotifications(savedRegistration.id, new URL(request.url).origin);
          ticketEmailSent = delivery.failed.length === 0;
        } catch (mailError) {
          console.error('Founders Expo ticket email failed:', mailError);
        }
      }
      return json({ ticketId, accessToken: createTicketAccessToken([ticketId]), ticketEmailSent });
    } catch (validationError) {
      return json({ error: validationError instanceof Error ? validationError.message : 'Invalid registration details.' }, 400);
    }
  }

  let cleanRows;
  try {
    cleanRows = rows.map((row: any) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid attendee details.');
      const name = optionalText(row.name, 'Name', 120);
      const email = optionalText(row.email, 'Email', 320)?.toLowerCase() ?? null;
      if (!name || !email || !EMAIL_PATTERN.test(email)) {
        throw new Error('Every attendee needs a valid name and email address.');
      }

      return {
        name,
        email,
        phone: optionalText(row.phone, 'Phone', 40),
        roll_number: optionalText(row.roll_number, 'Roll number', 80),
        branch: optionalText(row.branch, 'Branch'),
        year_of_study: optionalText(row.year_of_study, 'Year', 20),
        section: optionalText(row.section, 'Section', 40),
        college: optionalText(row.college, 'College'),
        team_name: optionalText(row.team_name, 'Team name', 120),
      };
    });
  } catch (validationError) {
    return json({ error: validationError instanceof Error ? validationError.message : 'Invalid attendee details.' }, 400);
  }

  const emails = cleanRows.map((row: { email: string }) => row.email);
  if (new Set(emails).size !== emails.length) {
    return json({ error: 'Each attendee must use a different email address.' }, 400);
  }

  const minTeamSize = Number(event.min_team_size) || 0;
  const maxTeamSize = Number(event.max_team_size) || 0;
  if (event.is_team_event) {
    if (rows.length < Math.max(minTeamSize, 1) || (maxTeamSize > 0 && rows.length > maxTeamSize)) {
      const limit = maxTeamSize > 0 ? `${Math.max(minTeamSize, 1)}–${maxTeamSize}` : `at least ${Math.max(minTeamSize, 1)}`;
      return json({ error: `Teams must have ${limit} members, including the team leader.` }, 400);
    }
    const teamNames = cleanRows.map((row: { team_name: string | null }) => row.team_name);
    if (teamNames.some((name: string | null) => !name) || new Set(teamNames).size !== 1) {
      return json({ error: 'All team members must use the same team name.' }, 400);
    }
  } else if (rows.length !== 1) {
    return json({ error: 'This event accepts one attendee per registration.' }, 400);
  }

  const { data: registrations, error } = await supabaseAdmin.rpc('register_event_batch', {
    p_event_id: eventId,
    p_rows: cleanRows,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('REGISTRATION_CLOSED')) {
      return json({ error: 'Registration has closed for this event.' }, 409);
    }
    if (message.includes('CAPACITY_REACHED')) {
      return json({ error: 'There are not enough registration slots left for this team.' }, 409);
    }
    if (message.includes('TEAM_SIZE_INVALID')) {
      return json({ error: 'The submitted team size does not meet this event’s requirements.' }, 409);
    }
    if (message.includes('EVENT_NOT_FOUND')) return json({ error: 'Event not found.' }, 404);
    if (error.code === '23505' || message.includes('DUPLICATE_EMAIL')) {
      return json({ code: '23505', error: 'One of the emails entered is already registered for this event.' }, 409);
    }
    console.error('Event registration RPC failed:', error.code, error.message);
    return json({ error: 'Could not complete registration.' }, 500);
  }

  const ticketIds = (registrations ?? []).map((registration: { ticket_id: string }) => registration.ticket_id);
  return json({ registrations, accessToken: createTicketAccessToken(ticketIds) });
};
