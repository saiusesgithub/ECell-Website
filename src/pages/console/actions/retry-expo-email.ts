export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { sendFoundersExpoNotifications } from '../../../lib/foundersExpoMail.js';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 }); }
  const { registrationId } = body ?? {};
  if (typeof registrationId !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid email request.' }), { status: 400 });
  }
  const { data: registration, error } = await supabaseAdmin.from('registrations')
    .select('id, events (slug)').eq('id', registrationId).single();
  if (error || !registration || (registration.events as any)?.slug !== 'founders-expo-26') {
    return new Response(JSON.stringify({ error: 'Founders Expo registration not found.' }), { status: 404 });
  }
  try {
    const delivery = await sendFoundersExpoNotifications(registrationId, new URL(request.url).origin);
    return new Response(JSON.stringify({ success: true, delivery }), { status: 200 });
  } catch (mailError) {
    console.error('Founders Expo email retry failed:', mailError);
    return new Response(JSON.stringify({ error: 'Email delivery failed. Check server logs and try again.' }), { status: 500 });
  }
};
