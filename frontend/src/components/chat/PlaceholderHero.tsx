import React from 'react';

const SUGGESTED_QUESTIONS = [
  'What is the return policy for defective products?',
  'How long does standard shipping take?',
  'How long do refunds take after approval?',
  'Can I cancel an order after it has shipped?',
  'How are ShopEase loyalty points earned and redeemed?',
];

const ARCHITECTURE_PILLARS = [
  {
    title: 'Evidence-Grounded RAG',
    description: 'Synthesizes answers strictly from retrieved ShopEase documentation.',
    icon: '🔍',
  },
  {
    title: 'Verified Citations',
    description: 'Every answer provides clickable source references backed by chunk IDs.',
    icon: '📄',
  },
  {
    title: 'Strict Policy Abstention',
    description: 'Explicitly refuses to answer when documentation is insufficient.',
    icon: '🛡️',
  },
  {
    title: 'Privacy & Ephemeral Session',
    description: 'Zero signup, no cookies, and zero permanent conversation logging.',
    icon: '🔒',
  },
];

export const PlaceholderHero: React.FC = () => {
  return (
    <section
      aria-labelledby="hero-heading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        margin: 'auto 0',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
        <h2
          id="hero-heading"
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          How can we help with your ShopEase order?
        </h2>
        <p
          style={{
            fontSize: '1.0625rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          SupportIQ answers customer inquiries using official ShopEase policies. Explore return rules, shipping timelines, warranty coverage, and loyalty points.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {ARCHITECTURE_PILLARS.map((pillar) => (
          <div
            key={pillar.title}
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }} aria-hidden="true">
              {pillar.icon}
            </div>
            <h3
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: '0.25rem',
              }}
            >
              {pillar.title}
            </h3>
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {pillar.description}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          Sample Questions (Grounded Knowledge Base)
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SUGGESTED_QUESTIONS.map((question) => (
            <div
              key={question}
              style={{
                padding: '0.5rem 0.875rem',
                backgroundColor: 'var(--color-bg-subtle)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.875rem',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {question}
            </div>
          ))}
        </div>
      </div>

      <div
        role="status"
        style={{
          padding: '1rem',
          backgroundColor: 'var(--color-brand-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-brand-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem',
          color: 'var(--color-text-primary)',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>
          ℹ️
        </span>
        <div>
          <strong>Phase 1B Milestone:</strong> Frontend foundation and accessible shell active. Chat input and RAG streaming will be connected in subsequent phases.
        </div>
      </div>
    </section>
  );
};

