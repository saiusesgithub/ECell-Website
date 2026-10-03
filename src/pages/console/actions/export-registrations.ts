export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

const COLUMNS = [
  'name', 'email', 'phone', 'roll_number', 'branch', 'year_of_study', 'section',
  'college', 'team_name', 'is_team_leader', 'payment_verified', 'is_checked_in',
  'ticket_id', 'extra_data', 'created_at',
];

function csvEscape(value: unknown) {
  const str = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const GET: APIRoute = async ({ url }) => {
  const eventId = url.searchParams.get('eventId');
  if (!eventId) {
    return new Response('Missing eventId', { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from('events').select('title').eq('id', eventId).single();
  const { data: registrations, error } = await supabaseAdmin
    .from('registrations')
    .select(COLUMNS.join(','))
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    return new Response(`Failed to load registrations: ${error.message}`, { status: 500 });
  }

  const rows = [
    COLUMNS.join(','),
    ...(registrations ?? []).map((reg: any) => COLUMNS.map((col) => csvEscape(reg[col])).join(',')),
  ];

  const filename = `${(event?.title ?? 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-registrations.csv`;

  return new Response(rows.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
