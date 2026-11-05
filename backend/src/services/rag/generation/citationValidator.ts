import { RetrievedChunk } from '../retrieval/types.js';
import { RawLlmCitation, SourceCitation } from './types.js';

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export interface DroppedCitation {
  chunkId: string;
  quote: string;
  reason: string;
}

export interface CitationValidationResult {
  validatedCitations: SourceCitation[];
  droppedCitations: DroppedCitation[];
  isUngrounded: boolean;
}

export interface ValidateCitationsOptions {
  maxCitations?: number;
}

export class CitationValidator {
  validate(
    candidateCitations: RawLlmCitation[],
    retrievedChunks: RetrievedChunk[],
    hasSufficientEvidence: boolean,
    options?: ValidateCitationsOptions
  ): CitationValidationResult {
    const chunkMap = new Map<string, RetrievedChunk>();
    for (const chunk of retrievedChunks) {
      chunkMap.set(chunk.id, chunk);
    }

    const maxAllowed = options?.maxCitations ?? retrievedChunks.length;
    const validatedCitations: SourceCitation[] = [];
    const droppedCitations: DroppedCitation[] = [];
    const seenChunkIds = new Set<string>();

    for (const candidate of candidateCitations) {
      const chunkId = candidate.chunkId?.trim();
      const quote = candidate.quote?.trim();

      if (!chunkId) {
        droppedCitations.push({
          chunkId: '',
          quote: quote ?? '',
          reason: 'Citation chunkId is empty or undefined.',
        });
        continue;
      }

      const matchingChunk = chunkMap.get(chunkId);
      if (!matchingChunk) {
        droppedCitations.push({
          chunkId,
          quote: quote ?? '',
          reason: `Chunk ID "${chunkId}" was not present in the retrieved chunk set.`,
        });
        continue;
      }

      if (seenChunkIds.has(chunkId)) {
        droppedCitations.push({
          chunkId,
          quote: quote ?? '',
          reason: `Duplicate citation for chunk "${chunkId}".`,
        });
        continue;
      }

      if (!quote || quote.length === 0) {
        droppedCitations.push({
          chunkId,
          quote: '',
          reason: 'Citation quote is empty.',
        });
        continue;
      }

      const normalizedChunkText = normalizeWhitespace(matchingChunk.text).toLowerCase();
      const normalizedQuote = normalizeWhitespace(quote).toLowerCase();
      const unescapedNormalizedQuote = normalizeWhitespace(unescapeXml(quote)).toLowerCase();

      const isSubstr =
        normalizedChunkText.includes(normalizedQuote) ||
        normalizedChunkText.includes(unescapedNormalizedQuote);

      if (!isSubstr) {
        droppedCitations.push({
          chunkId,
          quote,
          reason: `Cited quote could not be verified within chunk "${chunkId}" text.`,
        });
        continue;
      }

      if (validatedCitations.length >= maxAllowed) {
        droppedCitations.push({
          chunkId,
          quote,
          reason: `Maximum citation limit of ${maxAllowed} reached.`,
        });
        continue;
      }

      seenChunkIds.add(chunkId);
      validatedCitations.push({
        id: matchingChunk.id,
        title: matchingChunk.sourceTitle,
        section: matchingChunk.sectionTitle,
        excerpt: quote,
      });
    }

    const isUngrounded =
      hasSufficientEvidence &&
      candidateCitations.length > 0 &&
      validatedCitations.length === 0;

    return {
      validatedCitations,
      droppedCitations,
      isUngrounded,
    };
  }
}

