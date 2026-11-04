import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      role="contentinfo"
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-surface)',
        padding: '1.25rem 1.5rem',
        marginTop: 'auto',
        fontSize: '0.8125rem',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <p>
          <strong>Notice:</strong> ShopEase is a fictional brand created for demonstration purposes. All policies and documents are synthetic.
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          Grounded RAG architecture • Verifiable citations • Zero persistent user conversation storage
        </p>
      </div>
    </footer>
  );
};

