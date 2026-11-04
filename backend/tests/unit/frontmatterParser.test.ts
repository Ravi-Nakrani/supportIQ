import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/services/rag/ingestion/frontmatterParser.js';

describe('Frontmatter Parser (Unit)', () => {
  const validMarkdown = `---
id: shopease-returns-policy
title: "ShopEase Returns Policy"
category: 'Returns & Exchanges'
version: 1.0.0
effectiveDate: 2026-01-01
---

# Main Title
This is body text.`;

  it('should parse valid frontmatter and return clean body content', () => {
    const result = parseFrontmatter(validMarkdown, 'test.md');

    expect(result.frontmatter).toEqual({
      id: 'shopease-returns-policy',
      title: 'ShopEase Returns Policy',
      category: 'Returns & Exchanges',
      version: '1.0.0',
      effectiveDate: '2026-01-01',
    });
    expect(result.content).toBe('# Main Title\nThis is body text.');
  });

  it('should parse files with CRLF (Windows) line endings seamlessly', () => {
    const crlfMarkdown = validMarkdown.replace(/\n/g, '\r\n');
    const result = parseFrontmatter(crlfMarkdown, 'test.md');

    expect(result.frontmatter.id).toBe('shopease-returns-policy');
    expect(result.content).toBe('# Main Title\nThis is body text.');
  });

  it('should ignore comments and empty lines inside frontmatter', () => {
    const markdownWithComments = `---
# Policy identifier
id: shopease-shipping-policy

title: ShopEase Shipping Policy
category: Shipping
version: 2.1.0
effectiveDate: 2026-02-15
---
Body text`;

    const result = parseFrontmatter(markdownWithComments, 'shipping.md');
    expect(result.frontmatter.id).toBe('shopease-shipping-policy');
    expect(result.frontmatter.version).toBe('2.1.0');
  });

  it('should throw an informative error when starting delimiter is missing', () => {
    const invalid = `id: test-policy\ntitle: Test\n---\nBody`;
    expect(() => parseFrontmatter(invalid, 'invalid.md')).toThrowError(
      /Missing starting '---' delimiter in "invalid.md"/
    );
  });

  it('should throw an informative error when closing delimiter is missing', () => {
    const invalid = `---
id: test-policy
title: Test
Body without closing delimiter`;
    expect(() => parseFrontmatter(invalid, 'unclosed.md')).toThrowError(
      /Missing closing '---' delimiter in "unclosed.md"/
    );
  });

  it('should throw an error for malformed key-value lines without a colon', () => {
    const invalid = `---
id: test-policy
invalid line without colon
title: Test
category: General
version: 1.0.0
effectiveDate: 2026-01-01
---
Body`;
    expect(() => parseFrontmatter(invalid, 'malformed.md')).toThrowError(
      /Malformed line 3 in "malformed.md"/
    );
  });

  it('should reject missing required frontmatter fields via Zod validation', () => {
    const missingTitle = `---
id: test-policy
category: General
version: 1.0.0
effectiveDate: 2026-01-01
---
Body`;
    expect(() => parseFrontmatter(missingTitle, 'missing-title.md')).toThrowError(
      /Validation failed for "missing-title.md":\n - title:/
    );
  });

  it('should reject non-kebab-case id values', () => {
    const badId = `---
id: ShopEase Returns
title: Returns
category: General
version: 1.0.0
effectiveDate: 2026-01-01
---
Body`;
    expect(() => parseFrontmatter(badId, 'bad-id.md')).toThrowError(
      /Frontmatter 'id' must be kebab-case/
    );
  });

  it('should reject invalid semver version numbers', () => {
    const badVersion = `---
id: test-policy
title: Test
category: General
version: 1.0
effectiveDate: 2026-01-01
---
Body`;
    expect(() => parseFrontmatter(badVersion, 'bad-version.md')).toThrowError(
      /Frontmatter 'version' must follow semver format/
    );
  });

  it('should reject malformed effectiveDate strings', () => {
    const badDate = `---
id: test-policy
title: Test
category: General
version: 1.0.0
effectiveDate: 01-01-2026
---
Body`;
    expect(() => parseFrontmatter(badDate, 'bad-date.md')).toThrowError(
      /Frontmatter 'effectiveDate' must be in 'YYYY-MM-DD' format/
    );
  });
});
