import React, { useEffect, useRef } from 'react';
import type { CitationSource } from '../../types/chat.js';

export interface CitationModalProps {
  citation: CitationSource | null;
  onClose: () => void;
}

export const CitationModal: React.FC<CitationModalProps> = ({ citation, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!citation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Focus close button on open for accessible keyboard navigation
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [citation, onClose]);

  if (!citation) {
    return null;
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-modal-title"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking modal content
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn var(--transition-fast)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-brand-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.25rem',
              }}
            >
              Verified Knowledge Base Citation
            </div>
            <h3
              id="citation-modal-title"
              style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                lineHeight: 1.3,
              }}
            >
              {citation.title}
            </h3>
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                marginTop: '0.125rem',
              }}
            >
              Section: <strong>{citation.section}</strong>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close citation details"
            style={{
              padding: '0.375rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle)';
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Chunk ID metadata */}
          <div>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Document Chunk ID
            </span>
            <code
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                backgroundColor: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                color: 'var(--color-text-primary)',
                wordBreak: 'break-all',
              }}
            >
              {citation.id}
            </code>
          </div>

          {/* Verified Excerpt Box */}
          <div>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                marginBottom: '0.375rem',
              }}
            >
              Verified Policy Excerpt
            </span>
            <blockquote
              style={{
                margin: 0,
                padding: '1rem 1.25rem',
                backgroundColor: 'var(--color-bg-subtle)',
                borderLeft: '4px solid var(--color-brand-primary)',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                fontSize: '0.9375rem',
                color: 'var(--color-text-primary)',
                lineHeight: 1.6,
                fontStyle: 'normal',
                whiteSpace: 'pre-wrap',
              }}
            >
              "{citation.excerpt}"
            </blockquote>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.875rem 1.5rem',
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-app)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--color-brand-primary)',
              color: 'var(--color-text-inverse)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-brand-primary-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-brand-primary)';
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

