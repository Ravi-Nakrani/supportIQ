import React from 'react';
import { SuggestedQuestions } from './SuggestedQuestions.js';

export interface WelcomeHeroProps {
  suggestedQuestions: string[];
  onSelectQuestion: (question: string) => void;
  disabled?: boolean;
}

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
    description: 'Zero signup, zero cookies, and no conversation history stored.',
    icon: '🔒',
  },
];

export const WelcomeHero: React.FC<WelcomeHeroProps> = ({
  suggestedQuestions,
  onSelectQuestion,
  disabled = false,
}) => {
  return (
    <section
      aria-labelledby="hero-heading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        margin: 'auto 0',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
        <h2
          id="hero-heading"
          style={{
            fontSize: '1.875rem',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--color-text-primary)',
            marginBottom: '0.625rem',
          }}
        >
          How can we help with your ShopEase order?
        </h2>
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          SupportIQ answers customer questions using official ShopEase policies. Explore return rules, shipping timelines, warranty coverage, and loyalty points.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.875rem',
        }}
      >
        {ARCHITECTURE_PILLARS.map((pillar) => (
          <div
            key={pillar.title}
            style={{
              padding: '1.125rem',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: '1.375rem', marginBottom: '0.375rem' }} aria-hidden="true">
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
          padding: '1.25rem 1.5rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h3
          id="starter-questions-label"
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          Sample Questions (Grounded Knowledge Base)
        </h3>
        <SuggestedQuestions
          questions={suggestedQuestions}
          onSelectQuestion={onSelectQuestion}
          disabled={disabled}
          ariaLabel="Sample starter questions"
        />
      </div>

      <div
        role="note"
        aria-label="Fictional brand notice"
        style={{
          padding: '0.875rem 1.125rem',
          backgroundColor: 'var(--color-demo-badge-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-demo-badge-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--color-demo-badge-text)',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '1.125rem' }}>
          ℹ️
        </span>
        <div>
          <strong>Demo Notice:</strong> ShopEase is a fictional brand. All policy documents and responses are synthetic and for demonstration purposes.
        </div>
      </div>
    </section>
  );
};

