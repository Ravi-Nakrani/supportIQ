import React from 'react';

export interface SuggestedQuestionsProps {
  questions: string[];
  onSelectQuestion: (question: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({
  questions,
  onSelectQuestion,
  disabled = false,
  ariaLabel = 'Suggested questions',
}) => {
  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}
    >
      {questions.map((question, index) => (
        <button
          key={`${index}-${question}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelectQuestion(question)}
          style={{
            padding: '0.4375rem 0.875rem',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.8125rem',
            color: 'var(--color-brand-primary)',
            textAlign: 'left',
            lineHeight: 1.4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-brand-subtle)';
              e.currentTarget.style.borderColor = 'var(--color-brand-border)';
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)';
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
            }
          }}
        >
          {question}
        </button>
      ))}
    </div>
  );
};

