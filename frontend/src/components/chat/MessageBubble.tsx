import React from 'react';
import type { UIMessage, CitationSource } from '../../types/chat.js';
import { CitationPill } from '../citations/CitationPill.js';
import { SuggestedQuestions } from './SuggestedQuestions.js';

export interface MessageBubbleProps {
  message: UIMessage;
  onSelectQuestion?: (question: string) => void;
  onOpenCitation?: (citation: CitationSource) => void;
  isLatestAssistant?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onSelectQuestion,
  onOpenCitation,
}) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          margin: '0.75rem 0',
        }}
      >
        <div
          style={{
            maxWidth: '80%',
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
            padding: '0.875rem 1.125rem',
            borderRadius: '16px 16px 4px 16px',
            fontSize: '0.9375rem',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant Message
  const isInsufficient = message.status === 'insufficient_evidence';
  const hasSources = message.sources && message.sources.length > 0;
  const hasFollowUps = message.suggestedFollowUps && message.suggestedFollowUps.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.875rem',
        margin: '1rem 0',
      }}
    >
      {/* Assistant Avatar */}
      <div
        aria-hidden="true"
        style={{
          width: '2rem',
          height: '2rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: isInsufficient ? '#f59e0b' : 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '0.875rem',
          flexShrink: 0,
          marginTop: '0.25rem',
        }}
      >
        S
      </div>

      <div
        style={{
          flex: 1,
          maxWidth: '85%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {/* Main message card */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '4px 16px 16px 16px',
            padding: '1.125rem 1.25rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {/* Status badge when evidence is insufficient */}
          {isInsufficient && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.625rem',
                backgroundColor: 'var(--color-demo-badge-bg)',
                color: 'var(--color-demo-badge-text)',
                border: '1px solid var(--color-demo-badge-border)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 600,
                width: 'fit-content',
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>Documentation Insufficient</span>
            </div>
          )}

          {/* Answer text */}
          <div
            style={{
              fontSize: '0.9375rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message.content}
          </div>

          {/* Source Citations */}
          {hasSources && onOpenCitation && (
            <div
              style={{
                marginTop: '0.25rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--color-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-text-muted)',
                }}
              >
                Sources ({message.sources!.length}):
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {message.sources!.map((source) => (
                  <CitationPill
                    key={source.id}
                    citation={source}
                    onClick={onOpenCitation}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Suggested Follow-Ups */}
        {hasFollowUps && onSelectQuestion && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              paddingLeft: '0.25rem',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
              }}
            >
              Suggested follow-ups:
            </span>
            <SuggestedQuestions
              questions={message.suggestedFollowUps!}
              onSelectQuestion={onSelectQuestion}
              ariaLabel="Suggested follow-up questions"
            />
          </div>
        )}
      </div>
    </div>
  );
};

