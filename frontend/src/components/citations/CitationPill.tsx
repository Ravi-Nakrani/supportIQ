import React from 'react';
import type { CitationSource } from '../../types/chat.js';

export interface CitationPillProps {
  citation: CitationSource;
  onClick: (citation: CitationSource) => void;
  disabled?: boolean;
}

export const CitationPill: React.FC<CitationPillProps> = ({
  citation,
  onClick,
  disabled = false,
}) => {
  const label = `${citation.title} — ${citation.section}`;

  return (
    <button
      type="button"
      onClick={() => onClick(citation)}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-label={`View citation source: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        backgroundColor: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.75rem',
        color: 'var(--color-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition-fast)',
        maxWidth: '100%',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'var(--color-brand-subtle)';
          e.currentTarget.style.borderColor = 'var(--color-brand-border)';
          e.currentTarget.style.color = 'var(--color-brand-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle)';
          e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '0.875rem' }}>
        📄
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
};

