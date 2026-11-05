import React, { useState, useRef, useEffect, KeyboardEvent, FormEvent } from 'react';

export interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  disabled = false,
  maxLength = 1000,
  placeholder = 'Ask a question about ShopEase returns, warranties, shipping, or refunds...',
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isOverLimit = text.length > maxLength;
  const isSendDisabled = disabled || !text.trim() || isOverLimit;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Chat input form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-default)',
        padding: '0.75rem 1rem',
        boxShadow: 'var(--shadow-md)',
        transition: 'border-color var(--transition-fast)',
      }}
      onFocusCapture={() => {
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          maxLength={maxLength}
          rows={1}
          placeholder={placeholder}
          aria-label="Ask a question about ShopEase policies"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '0.9375rem',
            lineHeight: 1.5,
            color: 'var(--color-text-primary)',
            backgroundColor: 'transparent',
            padding: 0,
            maxHeight: '180px',
            overflowY: 'auto',
          }}
        />

        <button
          type="submit"
          disabled={isSendDisabled}
          aria-label="Send question"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isSendDisabled ? 'var(--color-bg-subtle)' : 'var(--color-brand-primary)',
            color: isSendDisabled ? 'var(--color-text-muted)' : 'var(--color-text-inverse)',
            border: 'none',
            cursor: isSendDisabled ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            transition: 'background-color var(--transition-fast), transform var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!isSendDisabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-brand-primary-hover)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSendDisabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-brand-primary)';
            }
          }}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.6875rem',
          color: isOverLimit ? '#e11d48' : 'var(--color-text-muted)',
          paddingTop: '0.25rem',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <span>Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for newline</span>
        <span aria-live="polite">
          {text.length} / {maxLength}
        </span>
      </div>
    </form>
  );
};

