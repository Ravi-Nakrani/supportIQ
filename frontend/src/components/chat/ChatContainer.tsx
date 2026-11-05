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
          }}
        >
          <ChatInput onSubmit={sendMessage} disabled={isLoading} />
        </div>
      </div>

      <CitationModal citation={activeCitation} onClose={closeCitation} />
    </AppShell>
  );
};

