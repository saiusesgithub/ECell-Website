function str(formData, field) {
  const value = formData.get(field)?.toString().trim();
  return value ? value : null;
}

function num(formData, field) {
  const value = formData.get(field)?.toString().trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function bool(formData, field) {
  return formData.get(field)?.toString() === 'true';
}

function raw(formData, field) {
  return formData.get(field)?.toString() ?? '';
}

function lines(formData, field) {
  const value = raw(formData, field);
  const entries = value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  return entries.length ? entries : null;
}

function nameObjects(formData, field) {
  const entries = lines(formData, field);
  return entries ? entries.map((name) => ({ name })) : null;
}

function nameObject(formData, field) {
  const value = str(formData, field);
  return value ? { name: value } : null;
}

export function eventFormDraft(formData) {
  return {
    title: raw(formData, 'title'),
    slug: raw(formData, 'slug'),
    short_description: raw(formData, 'short_description'),
    long_description: raw(formData, 'long_description'),
    date: raw(formData, 'date'),
    time: raw(formData, 'time'),
    venue: raw(formData, 'venue'),
    location_map_link: raw(formData, 'location_map_link'),
    mode: raw(formData, 'mode'),
    event_type: raw(formData, 'event_type'),
    status: raw(formData, 'status'),
    is_featured: bool(formData, 'is_featured'),
    registration_open: bool(formData, 'registration_open'),
    max_participants: raw(formData, 'max_participants'),
    registration_deadline: raw(formData, 'registration_deadline'),
    requirements: raw(formData, 'requirements'),
    prerequisites: raw(formData, 'prerequisites'),
    whatsapp_group_link: raw(formData, 'whatsapp_group_link'),
    is_team_event: bool(formData, 'is_team_event'),
    min_team_size: raw(formData, 'min_team_size'),
    max_team_size: raw(formData, 'max_team_size'),
    is_paid: bool(formData, 'is_paid'),
    price: raw(formData, 'price'),
    payment_link: raw(formData, 'payment_link'),
    prize_pool: raw(formData, 'prize_pool'),
    poster_url: raw(formData, 'poster_url'),
    recap_link: raw(formData, 'recap_link'),
    certificate_template_url: raw(formData, 'certificate_template_url'),
    gallery_images: raw(formData, 'gallery_images'),
    speakers: raw(formData, 'speakers'),
    judges: raw(formData, 'judges'),
    chief_guest: raw(formData, 'chief_guest'),
    winners: raw(formData, 'winners'),
  };
}

export function parseEventForm(formData) {
  const deadlineInput = str(formData, 'registration_deadline');
  const slug = str(formData, 'slug');
  const registrationDeadline = deadlineInput && slug === 'founders-expo-26'
    ? new Date(`${deadlineInput}:00+05:30`).toISOString().slice(0, 19).replace('T', ' ')
    : deadlineInput;
  return {
    title: str(formData, 'title'),
    slug,
    short_description: str(formData, 'short_description'),
    long_description: str(formData, 'long_description'),
    date: str(formData, 'date'),
    time: str(formData, 'time'),
    venue: str(formData, 'venue'),
    location_map_link: str(formData, 'location_map_link'),
    mode: str(formData, 'mode'),
    event_type: str(formData, 'event_type'),
    status: str(formData, 'status'),
    is_featured: bool(formData, 'is_featured'),
    registration_open: bool(formData, 'registration_open'),
    max_participants: num(formData, 'max_participants'),
    registration_deadline: registrationDeadline,
    requirements: str(formData, 'requirements'),
    prerequisites: str(formData, 'prerequisites'),
    whatsapp_group_link: str(formData, 'whatsapp_group_link'),
    is_team_event: bool(formData, 'is_team_event'),
    min_team_size: num(formData, 'min_team_size'),
    max_team_size: num(formData, 'max_team_size'),
    is_paid: bool(formData, 'is_paid'),
    price: num(formData, 'price'),
    payment_link: str(formData, 'payment_link'),
    prize_pool: str(formData, 'prize_pool'),
    poster_url: str(formData, 'poster_url'),
    recap_link: str(formData, 'recap_link'),
    certificate_template_url: str(formData, 'certificate_template_url'),
    gallery_images: lines(formData, 'gallery_images'),
    speakers: nameObjects(formData, 'speakers'),
    judges: nameObjects(formData, 'judges'),
    chief_guest: nameObject(formData, 'chief_guest'),
    winners: nameObjects(formData, 'winners'),
  };
}
