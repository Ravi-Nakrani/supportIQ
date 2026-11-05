import React from 'react';

export interface HeaderProps {
  onNewChat?: () => void;
  hasMessages?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onNewChat, hasMessages = false }) => {
  return (
    <header
      role="banner"
      style={{
        borderBottom: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-surface)',
        padding: '0.875rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          aria-hidden="true"
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          S
        </div>
        <div>
          <h1
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              lineHeight: 1.2,
              color: 'var(--color-text-primary)',
            }}
          >
            SupportIQ
          </h1>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              lineHeight: 1.2,
            }}
          >
            ShopEase Customer Support Assistant
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-demo-badge-bg)',
            color: 'var(--color-demo-badge-text)',
            border: '1px solid var(--color-demo-badge-border)',
          }}
        >
          Demo Knowledge Base: ShopEase
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-badge-bg)',
            color: 'var(--color-badge-text)',
            border: '1px solid var(--color-badge-border)',
          }}
        >
          No Login Required
        </span>

        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            disabled={!hasMessages}
            aria-label="Start a new conversation"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.25rem 0.625rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: hasMessages ? 'var(--color-brand-subtle)' : 'var(--color-bg-subtle)',
              color: hasMessages ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
              border: '1px solid',
              borderColor: hasMessages ? 'var(--color-brand-border)' : 'var(--color-border-subtle)',
              cursor: hasMessages ? 'pointer' : 'default',
              opacity: hasMessages ? 1 : 0.6,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              if (hasMessages) {
                e.currentTarget.style.backgroundColor = 'var(--color-brand-primary)';
                e.currentTarget.style.color = 'var(--color-text-inverse)';
              }
            }}
            onMouseLeave={(e) => {
              if (hasMessages) {
                e.currentTarget.style.backgroundColor = 'var(--color-brand-subtle)';
                e.currentTarget.style.color = 'var(--color-brand-primary)';
              }
            }}
          >
            <span aria-hidden="true">↺</span>
            <span>New Chat</span>
          </button>
        )}
      </div>
    </header>
  );
};

