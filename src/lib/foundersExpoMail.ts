import { supabaseAdmin } from './supabaseAdmin.js';
import { generateTicketsPdfBytes } from './ticketPdf.js';
import { bytesToBase64 } from './bytesToBase64.js';

type Member = { name: string; email: string };

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

export async function sendFoundersExpoNotifications(registrationId: string, baseUrl: string) {
  const { data: registration, error } = await supabaseAdmin.from('registrations')
    .select('id, name, email, phone, ticket_id, team_name, email_sent, extra_data, events (title, date, time, venue, whatsapp_group_link)')
    .eq('id', registrationId).single();
  if (error || !registration) throw new Error('Could not load the stall registration.');

  const apiKey = import.meta.env.MAILEROO_API_KEY;
  const fromAddress = import.meta.env.MAILEROO_FROM_ADDRESS;
  const fromName = import.meta.env.MAILEROO_FROM_NAME || 'E-Cell VJIT';
  if (!apiKey || !fromAddress) throw new Error('Email sending is not configured.');

  const event = registration.events as any;
  const members = Array.isArray(registration.extra_data?.members) ? registration.extra_data.members as Member[] : [];
  const recipients = [{ name: registration.name, email: registration.email }, ...members];
  const sentKey = 'approved_email_sent_to';
  const extraData = { ...registration.extra_data };
  const sentTo = new Set<string>(Array.isArray(extraData[sentKey]) ? extraData[sentKey] : []);
  const failed: string[] = [];
  const pdfBase64 = bytesToBase64(await generateTicketsPdfBytes([registration], { baseUrl }));

  for (const recipient of recipients) {
    if (sentTo.has(recipient.email)) continue;
    const heading = 'Your Founders Expo stall pass';
    const message = 'Your free registration is confirmed. The stall pass is attached. This is one shared pass for your registered team.';
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#221111">
      <h1>${escapeHtml(heading)}</h1><p>Hi ${escapeHtml(recipient.name)},</p><p>${escapeHtml(message)}</p>
      <p><strong>Event:</strong> ${escapeHtml(event?.title ?? 'Founders Expo')}</p>
      <p><strong>Team / idea:</strong> ${escapeHtml(registration.team_name)}</p>
      ${event?.whatsapp_group_link ? `<p><a href="${escapeHtml(event.whatsapp_group_link)}">Join the event WhatsApp group</a></p>` : ''}
      <p>E-Cell VJIT</p></div>`;
    try {
      const response = await fetch('https://smtp.maileroo.com/api/v2/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: { address: fromAddress, display_name: fromName },
          to: [{ address: recipient.email, display_name: recipient.name }],
          subject: `${heading} - ${event?.title ?? 'Founders Expo'}`,
          html,
          attachments: [{ file_name: 'stall-pass.pdf', content_type: 'application/pdf', content: pdfBase64 }],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error('Email provider rejected the message.');
      sentTo.add(recipient.email);
      const { data: latest } = await supabaseAdmin.from('registrations')
        .select('extra_data').eq('id', registration.id).single();
      const mergedSent = new Set<string>([
        ...(Array.isArray(latest?.extra_data?.[sentKey]) ? latest.extra_data[sentKey] : []),
        ...sentTo,
      ]);
      const { error: updateError } = await supabaseAdmin.from('registrations')
        .update({ extra_data: { ...latest?.extra_data, [sentKey]: [...mergedSent] }, ...(mergedSent.size === recipients.length
          ? { email_sent: true, email_sent_at: new Date().toISOString() } : {}) })
        .eq('id', registration.id);
      if (updateError) throw new Error(`Could not record email delivery: ${updateError.message}`);
    } catch (sendError) {
      console.error(`Founders Expo ticket email failed for ${recipient.email}:`, sendError);
      failed.push(recipient.email);
    }
  }

  return { sent: [...sentTo], failed, total: recipients.length };
}
