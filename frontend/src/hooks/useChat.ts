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
  checkBackendReadiness,
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
  isBackendWarmingUp: boolean;
  backendReadiness: 'checking' | 'ready' | 'degraded';
  queuedMessage: string | null;
  retryWarmUp: () => Promise<void>;
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

  // Cold-start warm-up tracking (85-second bounded probe window)
  const [backendReadiness, setBackendReadiness] = useState<'checking' | 'ready' | 'degraded'>('checking');
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const queuedMessageRef = useRef<string | null>(null);

  // Guards against stale requests and race conditions after New Chat
  const conversationGenerationRef = useRef<number>(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const lastSubmittedQueryRef = useRef<string | null>(null);
  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  const isBackendWarmingUp = backendReadiness === 'checking';

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

  const executeSendMessage = useCallback(async (trimmed: string) => {
    setError(null);
    lastSubmittedQueryRef.current = trimmed;

    // 1. Snapshot current generation and construct history from existing messages
    const requestGeneration = conversationGenerationRef.current;
    const historyPayload = buildBoundedHistory(messagesRef.current);

    // 2. Add user question to in-memory message list
    const userMessage: UIMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // 3. Create fresh AbortController with 30s client timeout
    const controller = new AbortController();
    activeControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort('CLIENT_30S_TIMEOUT');
    }, 30000);

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
      if (conversationGenerationRef.current !== requestGeneration) {
        return;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        if (controller.signal.reason === 'CLIENT_30S_TIMEOUT') {
          setError({
            code: 'GATEWAY_TIMEOUT',
            message: 'The request timed out after 30 seconds. Please try asking again.',
            canRetry: true,
          });
          return;
        }
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
      clearTimeout(timeoutId);
      if (
        conversationGenerationRef.current === requestGeneration &&
        activeControllerRef.current === controller
      ) {
        activeControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  // Bounded warm-up probing loop (85s maximum window, 4s polling intervals)
  const probeReadiness = useCallback(
    async (signal: AbortSignal) => {
      const WARM_UP_MAX_MS = 85000;
      const PROBE_INTERVAL_MS = 4000;
      const startTime = Date.now();

      setBackendReadiness('checking');

      while (Date.now() - startTime < WARM_UP_MAX_MS && !signal.aborted) {
        try {
          const ready = await checkBackendReadiness(signal);
          if (ready) {
            setBackendReadiness('ready');
            if (queuedMessageRef.current) {
              const queued = queuedMessageRef.current;
              queuedMessageRef.current = null;
              setQueuedMessage(null);
              void executeSendMessage(queued);
            }
            return;
          }
        } catch {
          // Probe error, continue loop
        }

        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, PROBE_INTERVAL_MS);
          signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
        });
      }

      if (!signal.aborted) {
        setBackendReadiness('degraded');
      }
    },
    [executeSendMessage]
  );

  useEffect(() => {
    const controller = new AbortController();
    void probeReadiness(controller.signal);

    return () => {
      controller.abort();
    };
  }, [probeReadiness]);

  const retryWarmUp = useCallback(async () => {
    const controller = new AbortController();
    await probeReadiness(controller.signal);
  }, [probeReadiness]);

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

      // If backend is still warming up, queue the question
      if (backendReadiness === 'checking') {
        queuedMessageRef.current = trimmed;
        setQueuedMessage(trimmed);
        return;
      }

      await executeSendMessage(trimmed);
    },
    [backendReadiness, isLoading, executeSendMessage]
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
    isBackendWarmingUp,
    backendReadiness,
    queuedMessage,
    retryWarmUp,
    sendMessage,
    resetConversation,
    retryLastMessage,
    openCitation,
    closeCitation,
    dismissError,
  };
}
