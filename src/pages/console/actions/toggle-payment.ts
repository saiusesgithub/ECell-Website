export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

export const POST: APIRoute = async ({ request }) => {
  const { registrationId, current } = await request.json();

  if (!registrationId) {
    return new Response(JSON.stringify({ error: 'Missing registrationId.' }), { status: 400 });
  }

  const { data: registration, error: lookupError } = await supabaseAdmin.from('registrations')
    .select('id, events (slug)').eq('id', registrationId).single();
  if (lookupError || !registration) {
    return new Response(JSON.stringify({ error: 'Registration not found.' }), { status: 404 });
  }
  const isFoundersExpo = (registration.events as any)?.slug === 'founders-expo-26';
  if (isFoundersExpo) {
    return new Response(JSON.stringify({ error: 'Founders Expo is free; no payment approval is needed.' }), { status: 409 });
  }
  const nextValue = current !== 'true';
  let update = supabaseAdmin
    .from('registrations')
    .update({ payment_verified: nextValue })
    .eq('id', registrationId);
  const { data: updated, error } = await update.select('id').maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!updated) return new Response(JSON.stringify({ error: 'Registration not found.' }), { status: 404 });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
