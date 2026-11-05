import { z } from 'zod';

export const historyMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z
      .string()
      .trim()
      .min(1, 'History message content must not be empty.')
      .max(1000, 'History message content must not exceed 1000 characters.'),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'Message must not be empty.')
      .max(1000, 'Message must not exceed 1000 characters.'),
    history: z
      .array(historyMessageSchema)
      .max(6, 'Conversation history must not exceed 6 messages.')
      .optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
