import React from 'react';
import type { ChatErrorState } from '../../hooks/useChat.js';

export interface ErrorBannerProps {
  error: ChatErrorState;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  onRetry,
  onDismiss,
}) => {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '1rem 1.25rem',
        backgroundColor: '#fff1f2',
        border: '1px solid #fecdd3',
        borderRadius: 'var(--radius-md)',
        color: '#9f1239',
        fontSize: '0.875rem',
        boxShadow: 'var(--shadow-sm)',
        margin: '0.5rem 0',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ fontSize: '1.125rem', lineHeight: 1 }}>
          ⚠️
        </span>
        <div>
          <strong style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            {error.code === 'RATE_LIMITED' && 'Rate Limit Exceeded'}
            {error.code === 'USAGE_LIMIT_EXCEEDED' && 'Daily Demo Limit Reached'}
            {error.code === 'SERVICE_UNAVAILABLE' && 'Service Temporarily Busy / Unavailable'}
            {error.code === 'GATEWAY_TIMEOUT' && 'Request Timed Out'}
            {error.code === 'REQUEST_ABORTED' && 'Request Cancelled'}
            {error.code === 'NETWORK_ERROR' && 'Network Connection Error'}
            {error.code !== 'RATE_LIMITED' &&
              error.code !== 'USAGE_LIMIT_EXCEEDED' &&
              error.code !== 'SERVICE_UNAVAILABLE' &&
              error.code !== 'GATEWAY_TIMEOUT' &&
              error.code !== 'REQUEST_ABORTED' &&
              error.code !== 'NETWORK_ERROR' &&
              'Error Processing Request'}
          </strong>
          <p style={{ lineHeight: 1.4, color: '#881337' }}>{error.message}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginTop: '0.125rem' }}>
        {error.canRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '0.3125rem 0.625rem',
              backgroundColor: '#e11d48',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#be123c';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#e11d48';
            }}
          >
            Try Again
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error notification"
            style={{
              padding: '0.3125rem 0.5rem',
              backgroundColor: 'transparent',
              color: '#9f1239',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              border: '1px solid #fecdd3',
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

