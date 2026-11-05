export interface MarkdownSection {
  headingHierarchy: string[];
  sectionTitle: string;
  content: string;
}

export function parseMarkdownHeadings(markdown: string, defaultTitle: string = 'Document'): MarkdownSection[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  const sections: MarkdownSection[] = [];

  let currentH1 = '';
  let currentH2 = '';
  let currentH3 = '';

  let currentContentLines: string[] = [];
  let inCodeFence = false;
  let activeFenceChar: string | null = null;
  let activeFenceLength = 0;

  function flushCurrentSection(): void {
    const rawContent = currentContentLines.join('\n').trim();
    if (rawContent.length > 0) {
      const hierarchy = [currentH1, currentH2, currentH3].filter((h) => h.length > 0);
      const sectionTitle = currentH3 || currentH2 || currentH1 || defaultTitle;

      sections.push({
        headingHierarchy: hierarchy.length > 0 ? hierarchy : [defaultTitle],
        sectionTitle,
        content: rawContent,
      });
    }
    currentContentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const trimmedLine = rawLine.trim();

    if (!inCodeFence) {
      const fenceMatch = trimmedLine.match(/^(`{3,}|~{3,})/);
      if (fenceMatch && fenceMatch[1]) {
        inCodeFence = true;
        activeFenceChar = fenceMatch[1][0] ?? '`';
        activeFenceLength = fenceMatch[1].length;
        currentContentLines.push(rawLine);
        continue;
      }
    } else {
      const escapedChar = activeFenceChar === '`' ? '`' : '~';
      const closingRegex = new RegExp(`^${escapedChar}{${activeFenceLength},}\\s*$`);
      if (closingRegex.test(trimmedLine)) {
        inCodeFence = false;
        activeFenceChar = null;
        activeFenceLength = 0;
      }
      currentContentLines.push(rawLine);
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].replace(/\s+#+\s*$/, '').trim();

      flushCurrentSection();

      if (level === 1) {
        currentH1 = headingText;
        currentH2 = '';
        currentH3 = '';
      } else if (level === 2) {
        currentH2 = headingText;
        currentH3 = '';
      } else if (level === 3) {
        currentH3 = headingText;
      }

      continue;
    }

    currentContentLines.push(rawLine);
  }

  flushCurrentSection();

  return sections;
}

