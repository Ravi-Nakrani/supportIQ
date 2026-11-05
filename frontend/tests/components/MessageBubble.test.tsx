import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../../src/components/chat/MessageBubble.js';
import type { UIMessage, CitationSource } from '../../src/types/chat.js';

describe('MessageBubble Component (Frontend)', () => {
  it('should render user message cleanly', () => {
    const userMessage: UIMessage = {
      id: 'u1',
      role: 'user',
      content: 'Can I return an opened blender?',
      timestamp: Date.now(),
    };

    render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('Can I return an opened blender?')).toBeInTheDocument();
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('should render assistant grounded message with citations and follow-ups', async () => {
    const user = userEvent.setup();
    const handleOpenCitation = vi.fn();
    const handleSelectQuestion = vi.fn();

    const citation: CitationSource = {
      id: 'returns#defective#1',
      title: 'ShopEase Returns Policy',
      section: 'Defective Products',
      excerpt: 'Defective items can be returned within 30 days.',
    };

    const assistantMessage: UIMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'According to the returns policy, opened defective items can be returned in 30 days.',
      timestamp: Date.now(),
      status: 'answered',
      sources: [citation],
      suggestedFollowUps: ['How do refunds work?'],
    };

    render(
      <MessageBubble
        message={assistantMessage}
        onOpenCitation={handleOpenCitation}
        onSelectQuestion={handleSelectQuestion}
      />
    );

    // Content assertion
    expect(
      screen.getByText(/opened defective items can be returned in 30 days/i)
    ).toBeInTheDocument();

    // Citation assertion
    const citationPill = screen.getByRole('button', {
      name: /View citation source: ShopEase Returns Policy — Defective Products/i,
    });
    expect(citationPill).toBeInTheDocument();
    await user.click(citationPill);
    expect(handleOpenCitation).toHaveBeenCalledWith(citation);

    // Follow-up assertion
    const followUpBtn = screen.getByRole('button', { name: 'How do refunds work?' });
    expect(followUpBtn).toBeInTheDocument();
    await user.click(followUpBtn);
    expect(handleSelectQuestion).toHaveBeenCalledWith('How do refunds work?');
  });

  it('should render insufficient evidence message with refusal badge and no source pills', () => {
    const refusalMessage: UIMessage = {
      id: 'a2',
      role: 'assistant',
      content: "I couldn't find enough information about that in the ShopEase documentation.",
      timestamp: Date.now(),
      status: 'insufficient_evidence',
      sources: [],
      suggestedFollowUps: ['What is the return policy?'],
    };

    render(<MessageBubble message={refusalMessage} />);

    // Refusal badge assertion
    expect(screen.getByText('Documentation Insufficient')).toBeInTheDocument();
    expect(
      screen.getByText(/couldn't find enough information about that/i)
    ).toBeInTheDocument();

    // No source citations should be present
    expect(screen.queryByText(/Sources \(/i)).not.toBeInTheDocument();
  });
});

