import { RetrievedChunk } from '../services/rag/retrieval/types.js';
import { ConversationMessage } from '../services/rag/generation/types.js';
import { GROUNDED_ANSWER_SYSTEM_PROMPT } from './groundedAnswer.prompt.js';

export function escapeXml(value: string): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface BuildPromptParams {
  chunks: RetrievedChunk[];
  question: string;
  history?: ConversationMessage[] | undefined;
  maxHistoryItems?: number | undefined;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userMessage: string;
  messages: [
    { role: 'system'; content: string },
    { role: 'user'; content: string }
  ];
}

export function buildGroundedPrompt(params: BuildPromptParams): BuiltPrompt {
  const { chunks, question, history = [], maxHistoryItems = 6 } = params;

  const chunkElements: string[] = [];
  for (const chunk of chunks) {
    const escapedId = escapeXml(chunk.id);
    const escapedTitle = escapeXml(chunk.sourceTitle);
    const escapedSection = escapeXml(chunk.sectionTitle);
    const escapedText = escapeXml(chunk.text);

    chunkElements.push(
      `  <chunk id="${escapedId}" title="${escapedTitle}" section="${escapedSection}">\n    ${escapedText}\n  </chunk>`
    );
  }

  const documentContextXml =
    chunkElements.length > 0
      ? `<document_context>\n${chunkElements.join('\n')}\n</document_context>`
      : '<document_context>\n  <!-- No relevant documents found -->\n</document_context>';

  const boundedHistory = history.slice(-maxHistoryItems);
  const historyElements: string[] = [];

  for (const msg of boundedHistory) {
    const safeRole = msg.role === 'assistant' ? 'assistant' : 'user';
    const escapedContent = escapeXml(msg.content);
    historyElements.push(`  <turn role="${safeRole}">${escapedContent}</turn>`);
  }

  const conversationHistoryXml =
    historyElements.length > 0
      ? `<conversation_history>\n${historyElements.join('\n')}\n</conversation_history>`
      : '<conversation_history>\n  <!-- No previous conversation -->\n</conversation_history>';

  const escapedQuestion = escapeXml(question.trim());
  const userQuestionXml = `<user_question>\n  ${escapedQuestion}\n</user_question>`;

  const userMessage = [
    documentContextXml,
    conversationHistoryXml,
    userQuestionXml,
  ].join('\n\n');

  return {
    systemPrompt: GROUNDED_ANSWER_SYSTEM_PROMPT,
    userMessage,
    messages: [
      { role: 'system', content: GROUNDED_ANSWER_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

