import { describe, it, expect } from 'vitest';
import { SupportIQGraphAnnotation } from '../../src/graph/state.js';

describe('SupportIQ Graph State (Unit)', () => {
  it('should initialize with status pending and correct defaults', () => {
    const channels = SupportIQGraphAnnotation.spec as Record<string, { value?: unknown; initialValueFactory?: () => unknown }>;

    expect(channels).toBeDefined();
    expect(channels.status).toBeDefined();
    expect(channels.history).toBeDefined();
    expect(channels.chunks).toBeDefined();
    expect(channels.retryCount).toBeDefined();

    // Verify default values via value property or initialValueFactory
    const defaultStatus = channels.status.value ?? channels.status.initialValueFactory?.();
    expect(defaultStatus).toBe('pending');

    const defaultHistory = channels.history.value ?? channels.history.initialValueFactory?.();
    expect(defaultHistory).toEqual([]);

    const defaultChunks = channels.chunks.value ?? channels.chunks.initialValueFactory?.();
    expect(defaultChunks).toEqual([]);

    const defaultRetryCount = channels.retryCount.value ?? channels.retryCount.initialValueFactory?.();
    expect(defaultRetryCount).toBe(0);

    const defaultAnswer = channels.answer.value ?? channels.answer.initialValueFactory?.();
    expect(defaultAnswer).toBe('');

    const defaultSources = channels.sources.value ?? channels.sources.initialValueFactory?.();
    expect(defaultSources).toEqual([]);
  });

  it('should not initialize status as answered', () => {
    const channels = SupportIQGraphAnnotation.spec as Record<string, { value?: unknown; initialValueFactory?: () => unknown }>;
    const defaultStatus = channels.status.value ?? channels.status.initialValueFactory?.();
    expect(defaultStatus).not.toBe('answered');
  });

  it('should replace state channels when updated by sequential nodes', () => {
    const channels = SupportIQGraphAnnotation.spec;
    const statusReducer = channels.status.reducer;

    if (statusReducer) {
      const nextStatus = statusReducer('pending', 'answered');
      expect(nextStatus).toBe('answered');
    }

    const retryCountReducer = channels.retryCount.reducer;
    if (retryCountReducer) {
      const nextRetryCount = retryCountReducer(0, 1);
      expect(nextRetryCount).toBe(1);
    }
  });
});
