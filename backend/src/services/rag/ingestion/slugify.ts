/**
 * Converts any section heading string into a deterministic, URL/ID-safe slug.
 *
 * @param text The heading text to convert.
 * @returns Kebab-cased slug string.
 */
export function slugify(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'section';
  }

  return trimmed
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')     // Remove non-alphanumeric chars except space and hyphen
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .replace(/-+/g, '-')         // Consolidate consecutive hyphens
    .replace(/^-+|-+$/g, '')     // Trim leading/trailing hyphens
    || 'section';
}

