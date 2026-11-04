import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseFrontmatter } from './frontmatterParser.js';
import { SourceDocument } from './types.js';

/**
 * Loads and validates all markdown policy documents in a target directory.
 *
 * Enforces:
 * 1. Deterministic alphabetical file ordering.
 * 2. Zod frontmatter schema validation on each file.
 * 3. Prevention of duplicate source IDs across distinct files.
 *
 * @param directoryPath Absolute or relative path to the knowledge base directory.
 * @param baseDir Optional root directory for computing clean relative sourcePath.
 * @returns Array of loaded and validated SourceDocument objects.
 */
export async function loadKnowledgeBaseDocuments(
  directoryPath: string,
  baseDir?: string
): Promise<SourceDocument[]> {
  let fileNames: string[];

  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    fileNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b)); // Strict deterministic sort
  } catch (error) {
    throw new Error(
      `[Document Loader] Failed to read knowledge base directory "${directoryPath}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (fileNames.length === 0) {
    throw new Error(`[Document Loader] No markdown (.md) documents found in "${directoryPath}".`);
  }

  const documents: SourceDocument[] = [];
  const seenSourceIds = new Map<string, string>(); // sourceId -> relative filePath

  for (const fileName of fileNames) {
    const fullPath = join(directoryPath, fileName);
    const displayPath = baseDir ? relative(baseDir, fullPath).replace(/\\/g, '/') : fileName;

    const rawFileContent = await readFile(fullPath, 'utf8');
    const { frontmatter, content } = parseFrontmatter(rawFileContent, displayPath);

    // Enforce uniqueness of sourceId across documents
    if (seenSourceIds.has(frontmatter.id)) {
      const priorPath = seenSourceIds.get(frontmatter.id);
      throw new Error(
        `[Document Loader Error] Duplicate source ID "${frontmatter.id}" detected in "${displayPath}". Previously defined in "${priorPath}".`
      );
    }
    seenSourceIds.set(frontmatter.id, displayPath);

    documents.push({
      frontmatter,
      rawContent: content,
      sourcePath: displayPath,
    });
  }

  return documents;
}

