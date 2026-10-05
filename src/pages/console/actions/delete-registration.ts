export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const registrationId = formData.get('registrationId')?.toString();
  const eventId = formData.get('eventId')?.toString();

  if (registrationId) {
    const { data: registration } = await supabaseAdmin.from('registrations')
      .select('extra_data').eq('id', registrationId).single();
    const { error } = await supabaseAdmin.from('registrations').delete().eq('id', registrationId);
    const proofPath = registration?.extra_data?.payment_screenshot_path;
    if (!error && typeof proofPath === 'string') {
      await supabaseAdmin.storage.from('founders-expo-payments').remove([proofPath]);
    }
  }

  return redirect(`/console/events/${eventId}/registrations`);
};
