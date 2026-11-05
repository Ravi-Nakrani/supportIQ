import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.875rem 1.25rem',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        width: 'fit-content',
        maxWidth: '100%',
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--color-text-secondary)',
        fontSize: '0.875rem',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <span
          style={{
            width: '0.5rem',
            height: '0.5rem',
            backgroundColor: 'var(--color-brand-primary)',
            borderRadius: 'var(--radius-full)',
            display: 'inline-block',
            animation: 'pulse 1.4s infinite ease-in-out',
          }}
        />
        <span
          style={{
            width: '0.5rem',
            height: '0.5rem',
            backgroundColor: 'var(--color-brand-primary)',
            borderRadius: 'var(--radius-full)',
            display: 'inline-block',
            animation: 'pulse 1.4s infinite ease-in-out',
            animationDelay: '0.2s',
          }}
        />
        <span
          style={{
            width: '0.5rem',
            height: '0.5rem',
            backgroundColor: 'var(--color-brand-primary)',
            borderRadius: 'var(--radius-full)',
            display: 'inline-block',
            animation: 'pulse 1.4s infinite ease-in-out',
            animationDelay: '0.4s',
          }}
        />
      </div>
      <span>Searching ShopEase policies &amp; verifying evidence...</span>
    </div>
  );
};

