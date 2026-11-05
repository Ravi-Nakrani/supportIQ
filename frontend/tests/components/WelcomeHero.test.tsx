import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeHero } from '../../src/components/chat/WelcomeHero.js';

describe('WelcomeHero Component (Frontend)', () => {
  const sampleQuestions = [
    'What is the return policy for defective products?',
    'How long does standard shipping take?',
  ];

  it('should render the hero heading, pillars, and synthetic notice', () => {
    render(<WelcomeHero suggestedQuestions={sampleQuestions} onSelectQuestion={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();

    expect(screen.getByText('Evidence-Grounded RAG')).toBeInTheDocument();
    expect(screen.getByText('Verified Citations')).toBeInTheDocument();
    expect(screen.getByText('Strict Policy Abstention')).toBeInTheDocument();
    expect(screen.getByText('Privacy & Ephemeral Session')).toBeInTheDocument();
    expect(screen.getByText(/ShopEase is a fictional brand/i)).toBeInTheDocument();
  });

  it('should render suggested questions and trigger selection on click', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    render(<WelcomeHero suggestedQuestions={sampleQuestions} onSelectQuestion={handleSelect} />);

    const questionBtn = screen.getByRole('button', {
      name: 'What is the return policy for defective products?',
    });
    expect(questionBtn).toBeInTheDocument();

    await user.click(questionBtn);
    expect(handleSelect).toHaveBeenCalledWith(
      'What is the return policy for defective products?'
    );
  });

  it('should disable starter question buttons when disabled is true', () => {
    render(
      <WelcomeHero
        suggestedQuestions={sampleQuestions}
        onSelectQuestion={vi.fn()}
        disabled={true}
      />
    );

    const questionBtn = screen.getByRole('button', {
      name: 'What is the return policy for defective products?',
    });
    expect(questionBtn).toBeDisabled();
  });
});

