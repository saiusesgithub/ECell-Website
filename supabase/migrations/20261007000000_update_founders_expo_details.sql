update public.events
set venue = 'C Block, Ground Floor, Seminar Hall',
    whatsapp_group_link = 'https://chat.whatsapp.com/HwVDt3NMVvK5xYxETbwMcm',
    requirements = 'Entry fee: ₹149 per startup/idea. Teams may have up to 3 members; individuals are welcome. One stall can represent only one idea/startup. Pay the fixed ₹149 fee using the QR code shown on the registration page.',
    updated_at = pg_catalog.now()
where slug = 'founders-expo-26';
