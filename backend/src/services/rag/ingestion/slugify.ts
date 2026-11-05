export function slugify(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'section';
  }

  return trimmed
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'section';
}

