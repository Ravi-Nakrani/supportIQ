import { describe, expect, it } from 'vitest';
import { parseMarkdownHeadings } from '../../src/services/rag/ingestion/markdownHeadingParser.js';

describe('Markdown Heading Parser (Unit)', () => {
  it('should extract H1, H2, and H3 hierarchies into structured sections', () => {
    const markdown = `# ShopEase Returns Policy

## Overview
This is the general return overview.

## Defective Products
We cover defective items within 30 days.

### Opened Box Conditions
Opened packaging is acceptable for defective products.`;

    const sections = parseMarkdownHeadings(markdown, 'Returns');

    expect(sections).toHaveLength(3);

    expect(sections[0]).toEqual({
      headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
      sectionTitle: 'Overview',
      content: 'This is the general return overview.',
    });

    expect(sections[1]).toEqual({
      headingHierarchy: ['ShopEase Returns Policy', 'Defective Products'],
      sectionTitle: 'Defective Products',
      content: 'We cover defective items within 30 days.',
    });

    expect(sections[2]).toEqual({
      headingHierarchy: ['ShopEase Returns Policy', 'Defective Products', 'Opened Box Conditions'],
      sectionTitle: 'Opened Box Conditions',
      content: 'Opened packaging is acceptable for defective products.',
    });
  });

  it('should reset H2 and H3 when a new H1 is encountered', () => {
    const markdown = `# First Document
## First Section
### First Subsection
Content 1.

# Second Document
Content 2 under new H1.`;

    const sections = parseMarkdownHeadings(markdown, 'Default');
    expect(sections).toHaveLength(2);

    expect(sections[0]?.headingHierarchy).toEqual([
      'First Document',
      'First Section',
      'First Subsection',
    ]);
    expect(sections[1]?.headingHierarchy).toEqual(['Second Document']);
    expect(sections[1]?.sectionTitle).toBe('Second Document');
    expect(sections[1]?.content).toBe('Content 2 under new H1.');
  });

  it('should strictly ignore heading syntax inside backtick code fences', () => {
    const markdown = `# Code Example Document

## Bash Instructions
Here is how to run the command:

\`\`\`bash
# This is a comment inside code fence, NOT a heading
echo "Hello World"
## This is also a comment
\`\`\`

More explanation after the code fence.`;

    const sections = parseMarkdownHeadings(markdown, 'Code Doc');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionTitle).toBe('Bash Instructions');
    expect(sections[0]?.content).toContain('# This is a comment inside code fence');
    expect(sections[0]?.content).toContain('## This is also a comment');
  });

  it('should strictly ignore heading syntax inside tilde (~~~) code fences', () => {
    const markdown = `# Tilde Test

## Tilde Section
~~~markdown
# Heading inside tilde fence
Body inside tilde fence
~~~
Text outside fence.`;

    const sections = parseMarkdownHeadings(markdown, 'Tilde Doc');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionTitle).toBe('Tilde Section');
    expect(sections[0]?.content).toContain('# Heading inside tilde fence');
  });

  it('should enforce matching fence marker characters (backtick fence cannot be closed by tildes)', () => {
    const markdown = `# Mismatched Delimiter Test

## Section One
\`\`\`javascript
const x = 10;
~~~
# This is still inside the backtick fence because tildes cannot close backticks
const y = 20;
\`\`\`
Final text.`;

    const sections = parseMarkdownHeadings(markdown, 'Delimiter Test');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionTitle).toBe('Section One');
    expect(sections[0]?.content).toContain('# This is still inside the backtick fence');
  });

  it('should enforce matching fence marker length (4 backticks cannot be closed by 3 backticks)', () => {
    const markdown = `# Fence Length Test

## Deep Fence
\`\`\`\`markdown
\`\`\`
# Still inside 4-backtick fence
\`\`\`
\`\`\`\`
Text outside.`;

    const sections = parseMarkdownHeadings(markdown, 'Length Test');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionTitle).toBe('Deep Fence');
    expect(sections[0]?.content).toContain('# Still inside 4-backtick fence');
  });

  it('should handle documents with introductory text before the first heading', () => {
    const markdown = `Introductory notice before any headers.

# Official Heading
First section body.`;

    const sections = parseMarkdownHeadings(markdown, 'Default Doc');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.sectionTitle).toBe('Default Doc');
    expect(sections[0]?.content).toBe('Introductory notice before any headers.');
    expect(sections[1]?.sectionTitle).toBe('Official Heading');
  });
});

