import React, { useEffect, useRef } from 'react';
import type { UIMessage, CitationSource } from '../../types/chat.js';
import type { ChatErrorState } from '../../hooks/useChat.js';
import { MessageBubble } from './MessageBubble.js';
import { TypingIndicator } from './TypingIndicator.js';
import { ErrorBanner } from './ErrorBanner.js';

export interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  error: ChatErrorState | null;
  onSelectQuestion: (question: string) => void;
  onOpenCitation: (citation: CitationSource) => void;
  onRetry?: () => void;
  onDismissError?: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  error,
  onSelectQuestion,
  onOpenCitation,
  onRetry,
  onDismissError,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on message list updates or loading state change
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, error]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation history"
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.5rem 0',
      }}
    >
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          onSelectQuestion={onSelectQuestion}
          onOpenCitation={onOpenCitation}
          isLatestAssistant={
            message.role === 'assistant' && index === messages.length - 1
          }
        />
      ))}

      {isLoading && (
        <div style={{ margin: '0.75rem 0' }}>
          <TypingIndicator />
        </div>
      )}

      {error && (
        <ErrorBanner
          error={error}
          onRetry={onRetry}
          onDismiss={onDismissError}
        />
      )}

      <div ref={bottomRef} style={{ height: '1px' }} />
    </div>
  );
};
