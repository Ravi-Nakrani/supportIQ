import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderHero } from '../src/components/chat/PlaceholderHero.js';

describe('PlaceholderHero Component (Frontend)', () => {
  it('should render the hero heading and explanatory text', () => {
    render(<PlaceholderHero />);

    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();
  });

  it('should display the core architecture pillars', () => {
    render(<PlaceholderHero />);

    expect(screen.getByText('Evidence-Grounded RAG')).toBeInTheDocument();
    expect(screen.getByText('Verified Citations')).toBeInTheDocument();
    expect(screen.getByText('Strict Policy Abstention')).toBeInTheDocument();
    expect(screen.getByText('Privacy & Ephemeral Session')).toBeInTheDocument();
  });

  it('should render sample knowledge-base questions', () => {
    render(<PlaceholderHero />);

    expect(
      screen.getByText('What is the return policy for defective products?')
    ).toBeInTheDocument();
    expect(screen.getByText('How long does standard shipping take?')).toBeInTheDocument();
    expect(screen.getByText('How long do refunds take after approval?')).toBeInTheDocument();
  });

  it('should display the milestone status callout', () => {
    render(<PlaceholderHero />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Phase 1B Milestone:/i)).toBeInTheDocument();
  });
});

