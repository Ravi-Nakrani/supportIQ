import { DocumentFrontmatter, FrontmatterSchema } from './types.js';

export interface ParsedDocument {
  frontmatter: DocumentFrontmatter;
  content: string;
}

/**
 * Parses simple '---' delimited YAML-style frontmatter from markdown text
 * and validates the fields using Zod.
 *
 * @param rawMarkdown The complete raw markdown text of a document.
 * @param sourcePath File path for informative error messages.
 * @returns Parsed frontmatter and markdown body content without frontmatter.
 */
export function parseFrontmatter(rawMarkdown: string, sourcePath: string = 'document'): ParsedDocument {
  // Normalize CRLF to LF
  const normalized = rawMarkdown.replace(/\r\n/g, '\n');

  // Check for starting delimiter
  if (!normalized.startsWith('---')) {
    throw new Error(
      `[Frontmatter Error] Missing starting '---' delimiter in "${sourcePath}". All policy documents must begin with frontmatter.`
    );
  }

  // Find closing delimiter (must be at the beginning of a line)
  const closingIndex = normalized.indexOf('\n---\n', 3);
  const closingAltIndex = normalized.indexOf('\n---', 3);

  let endOfFrontmatter: number;
  let bodyStartIndex: number;

  if (closingIndex !== -1) {
    endOfFrontmatter = closingIndex;
    bodyStartIndex = closingIndex + 5; // skip '\n---\n'
  } else if (closingAltIndex !== -1 && (closingAltIndex + 4 === normalized.length || normalized[closingAltIndex + 4] === '\n')) {
    endOfFrontmatter = closingAltIndex;
    bodyStartIndex = closingAltIndex + 4;
    if (normalized[bodyStartIndex] === '\n') {
      bodyStartIndex += 1;
    }
  } else {
    throw new Error(
      `[Frontmatter Error] Missing closing '---' delimiter in "${sourcePath}". Frontmatter block was not closed.`
    );
  }

  const frontmatterText = normalized.substring(3, endOfFrontmatter).trim();
  const rawFields: Record<string, string> = {};

  const lines = frontmatterText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue; // Skip empty lines and comments
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `[Frontmatter Error] Malformed line ${i + 2} in "${sourcePath}": expected 'key: value', got "${line}".`
      );
    }

    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    // Strip wrapping single or double quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1).trim();
    }

    if (!key) {
      throw new Error(
        `[Frontmatter Error] Empty key at line ${i + 2} in "${sourcePath}".`
      );
    }

    rawFields[key] = value;
  }

  // Validate using Zod
  const parseResult = FrontmatterSchema.safeParse(rawFields);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[Frontmatter Error] Validation failed for "${sourcePath}":\n${issues}`
    );
  }

  const content = normalized.substring(bodyStartIndex).trim();

  return {
    frontmatter: parseResult.data,
    content,
  };
}

