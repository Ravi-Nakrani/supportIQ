import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat, buildBoundedHistory } from '../../src/hooks/useChat.js';
import * as chatApi from '../../src/services/chatApi.js';
import type { UIMessage, ChatResponse, DemoMetadataResponse } from '../../src/types/chat.js';
import { ApiClientError } from '../../src/services/chatApi.js';

describe('useChat Hook (Frontend)', () => {
  const mockDemoMetadata: DemoMetadataResponse = {
    assistantName: 'SupportIQ',
    companyName: 'ShopEase',
    demoNotice: 'Fictional demo notice',
    suggestedQuestions: ['Question A', 'Question B'],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(chatApi, 'getDemoMetadata').mockResolvedValue(mockDemoMetadata);
    vi.spyOn(chatApi, 'checkBackendReadiness').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildBoundedHistory', () => {
    it('should exclude error, pending, and empty messages', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Valid message 1', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Valid answer 1', timestamp: 2 },
        { id: '3', role: 'user', content: 'Error message', timestamp: 3, isError: true },
        { id: '4', role: 'assistant', content: '', timestamp: 4 },
        { id: '5', role: 'assistant', content: 'Pending answer', timestamp: 5, isPending: true },
        { id: '6', role: 'user', content: 'Valid message 2', timestamp: 6 },
      ];

      const result = buildBoundedHistory(messages);
      expect(result).toEqual([
        { role: 'user', content: 'Valid message 1' },
        { role: 'assistant', content: 'Valid answer 1' },
        { role: 'user', content: 'Valid message 2' },
      ]);
    });

    it('should cap history to at most the latest 6 messages', () => {
      const messages: UIMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: i,
      }));

      const result = buildBoundedHistory(messages);
      expect(result.length).toBe(6);
      expect(result[0]).toEqual({ role: 'user', content: 'Message 4' });
      expect(result[5]).toEqual({ role: 'assistant', content: 'Message 9' });
    });

    it('should prove the current question is not duplicated in the history payload', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Previous question', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Previous answer', timestamp: 2 },
      ];

      const newQuestion = 'Current new question';
      const historyPayload = buildBoundedHistory(messages);

      expect(historyPayload.some((h) => h.content === newQuestion)).toBe(false);
      expect(historyPayload).toEqual([
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ]);
    });
  });

  describe('Hook Lifecycle & Interaction', () => {
    it('should initialize with empty messages and load demo metadata', async () => {
      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      expect(hookResult.current.messages).toEqual([]);
      expect(hookResult.current.isLoading).toBe(false);
      expect(hookResult.current.error).toBeNull();
      expect(hookResult.current.demoMetadata).toEqual(mockDemoMetadata);
      expect(hookResult.current.isMetadataLoading).toBe(false);
    });

    it('should send a message and append assistant response', async () => {
      const mockChatResponse: ChatResponse = {
        status: 'answered',
        answer: 'Returns are accepted within 30 days.',
        sources: [
          {
            id: 'returns-1',
            title: 'Returns Policy',
            section: 'Defective Products',
            excerpt: '30 day window.',
          },
        ],
        suggestedFollowUps: ['How do refunds work?'],
      };

      const sendSpy = vi.spyOn(chatApi, 'sendChatMessage').mockResolvedValue(mockChatResponse);

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Can I return an item?');
      });

      expect(sendSpy).toHaveBeenCalledWith(
        {
          message: 'Can I return an item?',
          history: undefined,
        },
        expect.any(AbortSignal)
      );

      expect(result.current.messages.length).toBe(2);
      expect(result.current.messages[0]?.role).toBe('user');
      expect(result.current.messages[0]?.content).toBe('Can I return an item?');
      expect(result.current.messages[1]?.role).toBe('assistant');
      expect(result.current.messages[1]?.content).toBe('Returns are accepted within 30 days.');
      expect(result.current.messages[1]?.sources).toEqual(mockChatResponse.sources);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should include previous completed messages in history on follow-up questions', async () => {
      const mockResponse1: ChatResponse = {
        status: 'answered',
        answer: 'First answer',
        sources: [],
      };
      const mockResponse2: ChatResponse = {
        status: 'answered',
        answer: 'Second answer',
        sources: [],
      };

      const sendSpy = vi
        .spyOn(chatApi, 'sendChatMessage')
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage('Question 1');
      });

      await act(async () => {
        await result.current.sendMessage('Question 2');
      });

      expect(sendSpy).toHaveBeenLastCalledWith(
        {
          message: 'Question 2',
          history: [
            { role: 'user', content: 'Question 1' },
            { role: 'assistant', content: 'First answer' },
          ],
        },
        expect.any(AbortSignal)
      );
    });

    it('should handle reset during an in-flight request and abort active fetch', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(chatApi, 'sendChatMessage').mockImplementation((_req, signal) => {
        capturedSignal = signal;
        return new Promise((resolve) => setTimeout(resolve, 500));
      });

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      act(() => {
        void hookResult.current.sendMessage('Slow question');
      });

      expect(hookResult.current.isLoading).toBe(true);
      expect(hookResult.current.messages.length).toBe(1);

      act(() => {
        hookResult.current.resetConversation();
      });

      expect(hookResult.current.messages).toEqual([]);
      expect(hookResult.current.isLoading).toBe(false);
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('should ignore late resolution arriving after resetConversation (generation guard)', async () => {
      let resolvePromise!: (val: ChatResponse) => void;
      vi.spyOn(chatApi, 'sendChatMessage').mockImplementation(
        () =>
          new Promise<ChatResponse>((resolve) => {
            resolvePromise = resolve;
          })
      );

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      act(() => {
        void hookResult.current.sendMessage('In-flight query');
      });

      expect(hookResult.current.messages.length).toBe(1);

      act(() => {
        hookResult.current.resetConversation();
      });

      expect(hookResult.current.messages).toEqual([]);

      await act(async () => {
        resolvePromise({
          status: 'answered',
          answer: 'Old delayed answer',
          sources: [],
        });
      });

      expect(hookResult.current.messages).toEqual([]);
      expect(hookResult.current.isLoading).toBe(false);
    });

    it('should ignore late rejection arriving after resetConversation (generation guard)', async () => {
      let rejectPromise!: (err: unknown) => void;
      vi.spyOn(chatApi, 'sendChatMessage').mockImplementation(
        () =>
          new Promise<ChatResponse>((_resolve, reject) => {
            rejectPromise = reject;
          })
      );

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      act(() => {
        void hookResult.current.sendMessage('In-flight query that will fail');
      });

      act(() => {
        hookResult.current.resetConversation();
      });

      await act(async () => {
        rejectPromise(new ApiClientError('Server error', 500, 'INTERNAL_ERROR'));
      });

      expect(hookResult.current.error).toBeNull();
      expect(hookResult.current.messages).toEqual([]);
    });

    it('should protect finally cleanup so an old request does not clear a newer request loading state', async () => {
      let resolveFirst!: (val: ChatResponse) => void;
      let resolveSecond!: (val: ChatResponse) => void;

      vi.spyOn(chatApi, 'sendChatMessage')
        .mockImplementationOnce(
          () =>
            new Promise<ChatResponse>((resolve) => {
              resolveFirst = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<ChatResponse>((resolve) => {
              resolveSecond = resolve;
            })
        );

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      act(() => {
        void hookResult.current.sendMessage('First query');
      });
      expect(hookResult.current.isLoading).toBe(true);

      act(() => {
        hookResult.current.resetConversation();
      });
      act(() => {
        void hookResult.current.sendMessage('Second query');
      });
      expect(hookResult.current.isLoading).toBe(true);

      await act(async () => {
        resolveFirst({ status: 'answered', answer: 'First answer', sources: [] });
      });

      expect(hookResult.current.isLoading).toBe(true);

      await act(async () => {
        resolveSecond({ status: 'answered', answer: 'Second answer', sources: [] });
      });
      expect(hookResult.current.isLoading).toBe(false);
    });

    it('should silently ignore browser-side AbortError without showing an error banner', async () => {
      const abortError = new Error('The user aborted a request');
      abortError.name = 'AbortError';

      vi.spyOn(chatApi, 'sendChatMessage').mockRejectedValue(abortError);

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      await act(async () => {
        await hookResult.current.sendMessage('Aborted question');
      });

      expect(hookResult.current.error).toBeNull();
      expect(hookResult.current.isLoading).toBe(false);
    });

    it('should distinguish backend 400 REQUEST_ABORTED and display a friendly cancellation message', async () => {
      vi.spyOn(chatApi, 'sendChatMessage').mockRejectedValue(
        new ApiClientError('Request aborted by server', 400, 'REQUEST_ABORTED')
      );

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      await act(async () => {
        await hookResult.current.sendMessage('Server aborted question');
      });

      expect(hookResult.current.error).toEqual({
        code: 'REQUEST_ABORTED',
        message: 'The request was cancelled before completion. Please try asking your question again.',
        canRetry: true,
      });
    });

    it('should handle 503 SERVICE_UNAVAILABLE from concurrency saturation', async () => {
      vi.spyOn(chatApi, 'sendChatMessage').mockRejectedValue(
        new ApiClientError(
          'The assistant service is currently handling maximum concurrent requests.',
          503,
          'SERVICE_UNAVAILABLE'
        )
      );

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      await act(async () => {
        await hookResult.current.sendMessage('Busy server question');
      });

      expect(hookResult.current.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'The assistant service is currently handling maximum concurrent requests.',
        canRetry: true,
      });
    });

    it('should handle citation modal state correctly', async () => {
      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      const citation = {
        id: 'chunk-1',
        title: 'Title',
        section: 'Section',
        excerpt: 'Excerpt text',
      };

      act(() => {
        hookResult.current.openCitation(citation);
      });
      expect(hookResult.current.activeCitation).toEqual(citation);

      act(() => {
        hookResult.current.closeCitation();
      });
      expect(hookResult.current.activeCitation).toBeNull();
    });

    it('should queue message when backend is warming up and auto-send upon readiness', async () => {
      let resolveReadiness!: (value: boolean) => void;
      const readinessPromise = new Promise<boolean>((resolve) => {
        resolveReadiness = resolve;
      });
      vi.spyOn(chatApi, 'checkBackendReadiness').mockImplementation(() => readinessPromise);

      const mockChatResponse: ChatResponse = {
        status: 'answered',
        answer: 'Policy answer.',
        sources: [],
      };
      const sendSpy = vi.spyOn(chatApi, 'sendChatMessage').mockResolvedValue(mockChatResponse);

      let hookResult!: { current: ReturnType<typeof useChat> };
      await act(async () => {
        hookResult = renderHook(() => useChat()).result;
      });

      expect(hookResult.current.isBackendWarmingUp).toBe(true);
      expect(hookResult.current.backendReadiness).toBe('checking');

      await act(async () => {
        await hookResult.current.sendMessage('Queued policy question');
      });

      expect(hookResult.current.queuedMessage).toBe('Queued policy question');
      expect(sendSpy).not.toHaveBeenCalled();

      await act(async () => {
        resolveReadiness(true);
      });

      expect(hookResult.current.backendReadiness).toBe('ready');
      expect(hookResult.current.isBackendWarmingUp).toBe(false);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Queued policy question' }),
        expect.any(AbortSignal)
      );
    });
  });
});
