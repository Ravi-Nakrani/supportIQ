import React from 'react';
import { useChat } from '../../hooks/useChat.js';
import { AppShell } from '../layout/AppShell.js';
import { WelcomeHero } from './WelcomeHero.js';
import { MessageList } from './MessageList.js';
import { ChatInput } from './ChatInput.js';
import { CitationModal } from '../citations/CitationModal.js';

export const ChatContainer: React.FC = () => {
  const {
    messages,
    isLoading,
    error,
    activeCitation,
    demoMetadata,
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
  } = useChat();

  const hasMessages = messages.length > 0;
  const suggestedQuestions = demoMetadata?.suggestedQuestions ?? [];

  return (
    <AppShell onNewChat={resetConversation} hasMessages={hasMessages}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          justifyContent: hasMessages ? 'flex-start' : 'center',
          gap: '1.25rem',
        }}
      >
        {!hasMessages ? (
          <WelcomeHero
            suggestedQuestions={suggestedQuestions}
            onSelectQuestion={sendMessage}
            disabled={isLoading}
          />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            error={error}
            onSelectQuestion={sendMessage}
            onOpenCitation={openCitation}
            onRetry={retryLastMessage}
            onDismissError={dismissError}
          />
        )}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: '0.75rem',
            position: 'sticky',
            bottom: 0,
            zIndex: 5,
            backgroundColor: 'var(--color-bg-app)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {isBackendWarmingUp && !queuedMessage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                border: '1px solid rgba(217, 119, 6, 0.25)',
                color: '#b45309',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>⚡</span>
              <span>
                <strong>Demo server waking up</strong> (~50–60s on Render free tier). You can type your question now — it will be sent automatically when ready.
              </span>
            </div>
          )}

          {queuedMessage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: '#1d4ed8',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>⏳</span>
              <span>
                <strong>Question queued:</strong> &ldquo;{queuedMessage}&rdquo; — will submit as soon as the server is ready.
              </span>
            </div>
          )}

          {backendReadiness === 'degraded' && (
            <div
              role="alert"
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#b91c1c',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <span>Server wake-up took longer than expected. Your question is preserved.</span>
              <button
                type="button"
                onClick={retryWarmUp}
                style={{
                  background: '#b91c1c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry connecting
              </button>
            </div>
          )}

          <ChatInput onSubmit={sendMessage} disabled={isLoading} />
        </div>
      </div>

      <CitationModal citation={activeCitation} onClose={closeCitation} />
    </AppShell>
  );
};
