export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

export const GET: APIRoute = async ({ url }) => {
  const registrationId = url.searchParams.get('registrationId');
  if (!registrationId || !/^[0-9a-f-]{36}$/i.test(registrationId)) {
    return new Response('Invalid registration ID.', { status: 400 });
  }
  const { data: registration, error } = await supabaseAdmin.from('registrations')
    .select('extra_data, events (slug)').eq('id', registrationId).single();
  if (error || !registration || (registration.events as any)?.slug !== 'founders-expo-26') {
    return new Response('Payment screenshot not found.', { status: 404 });
  }
  const path = registration.extra_data?.payment_screenshot_path;
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(path)) {
    return new Response('Payment screenshot not found.', { status: 404 });
  }
  const { data, error: downloadError } = await supabaseAdmin.storage.from('founders-expo-payments').download(path);
  if (downloadError || !data) return new Response('Payment screenshot unavailable.', { status: 404 });
  const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(await data.arrayBuffer(), {
    headers: { 'Content-Type': type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};
