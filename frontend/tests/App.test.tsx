import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.js';

describe('App Root Component (Frontend)', () => {
  it('should render the full accessible application shell', () => {
    render(<App />);

    // Header assertions
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'SupportIQ' })).toBeInTheDocument();
    expect(screen.getByText(/ShopEase Customer Support Assistant/i)).toBeInTheDocument();

    // Main landmark assertions
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();

    // Footer assertions
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText(/ShopEase is a fictional brand/i)).toBeInTheDocument();
  });
});

