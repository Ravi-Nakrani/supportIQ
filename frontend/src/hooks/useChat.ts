import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  UIMessage,
  CitationSource,
  DemoMetadataResponse,
  HistoryMessage,
  ApiErrorCode,
} from '../types/chat.js';
import {
  sendChatMessage,
  getDemoMetadata,
  ApiClientError,
  FALLBACK_DEMO_METADATA,
} from '../services/chatApi.js';

export interface ChatErrorState {
  code: ApiErrorCode;
  message: string;
  canRetry: boolean;
}

export interface UseChatReturn {
  messages: UIMessage[];
  isLoading: boolean;
  error: ChatErrorState | null;
  activeCitation: CitationSource | null;
  demoMetadata: DemoMetadataResponse | null;
  isMetadataLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  resetConversation: () => void;
  retryLastMessage: () => Promise<void>;
  openCitation: (citation: CitationSource) => void;
  closeCitation: () => void;
  dismissError: () => void;
}

/**
 * Filter eligible history messages for backend API submission:
 * - Only includes settled, non-error messages.
 * - Only includes roles 'user' and 'assistant'.
 * - Selects at most the latest 6 messages.
 * - Never includes the active/current question being sent.
 */
export function buildBoundedHistory(messages: UIMessage[]): HistoryMessage[] {
  const eligible = messages
    .filter(
      (m) =>
        !m.isError &&
        !m.isPending &&
        (m.role === 'user' || m.role === 'assistant') &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim(),
    }));

  return eligible.slice(-6);
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<ChatErrorState | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationSource | null>(null);
  const [demoMetadata, setDemoMetadata] = useState<DemoMetadataResponse | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState<boolean>(true);

  // Guards against stale requests and race conditions after New Chat
  const conversationGenerationRef = useRef<number>(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const lastSubmittedQueryRef = useRef<string | null>(null);

  // Fetch demo metadata once on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadMetadata() {
      try {
        const data = await getDemoMetadata(controller.signal);
        if (isMounted) {
          setDemoMetadata(data);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (isMounted) {
          // Graceful fallback to static ShopEase metadata
          setDemoMetadata(FALLBACK_DEMO_METADATA);
        }
      } finally {
        if (isMounted) {
          setIsMetadataLoading(false);
        }
      }
    }

    void loadMetadata();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const openCitation = useCallback((citation: CitationSource) => {
    setActiveCitation(citation);
  }, []);

  const closeCitation = useCallback(() => {
    setActiveCitation(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const resetConversation = useCallback(() => {
    // 1. Advance conversation generation to invalidate any in-flight requests
    conversationGenerationRef.current += 1;

    // 2. Abort active request if in flight
    if (activeControllerRef.current) {
      activeControllerRef.current.abort('NEW_CHAT_RESET');
      activeControllerRef.current = null;
    }

    // 3. Clear in-memory conversation state
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setActiveCitation(null);
    lastSubmittedQueryRef.current = null;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) {
        return;
      }

      setError(null);
      lastSubmittedQueryRef.current = trimmed;

      // 1. Snapshot current generation and construct history from existing messages
      const requestGeneration = conversationGenerationRef.current;
      const historyPayload = buildBoundedHistory(messages);

      // 2. Add user question to in-memory message list
      const userMessage: UIMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // 3. Create fresh AbortController for this request
      const controller = new AbortController();
      activeControllerRef.current = controller;

      try {
        const response = await sendChatMessage(
          {
            message: trimmed,
            history: historyPayload.length > 0 ? historyPayload : undefined,
          },
          controller.signal
        );

        // Generation guard: ignore completions from older conversations
        if (conversationGenerationRef.current !== requestGeneration) {
          return;
        }

        const assistantMessage: UIMessage = {
          id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: response.answer,
          timestamp: Date.now(),
          status: response.status,
          sources: response.sources,
          suggestedFollowUps: response.suggestedFollowUps,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setError(null);
      } catch (err: unknown) {
        // Generation guard: ignore errors from older conversations
        if (conversationGenerationRef.current !== requestGeneration) {
          return;
        }

        // Distinguish browser-side abort from backend 400 REQUEST_ABORTED
        if (err instanceof Error && err.name === 'AbortError') {
          // Browser-side abort caused by New Chat or component unmount; silently ignore
          return;
        }

        if (err instanceof ApiClientError) {
          if (err.code === 'REQUEST_ABORTED') {
            setError({
              code: 'REQUEST_ABORTED',
              message:
                'The request was cancelled before completion. Please try asking your question again.',
              canRetry: true,
            });
          } else {
            setError({
              code: err.code,
              message: err.message,
              canRetry: err.code !== 'USAGE_LIMIT_EXCEEDED',
            });
          }
          return;
        }

        setError({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while communicating with the assistant.',
          canRetry: true,
        });
      } finally {
        // Strict guard on finally cleanup: only clear if both generation AND controller identity match
        if (
          conversationGenerationRef.current === requestGeneration &&
          activeControllerRef.current === controller
        ) {
          activeControllerRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [isLoading, messages]
  );

  const retryLastMessage = useCallback(async () => {
    if (lastSubmittedQueryRef.current) {
      await sendMessage(lastSubmittedQueryRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    isLoading,
    error,
    activeCitation,
    demoMetadata,
    isMetadataLoading,
    sendMessage,
    resetConversation,
    retryLastMessage,
    openCitation,
    closeCitation,
    dismissError,
  };
}

