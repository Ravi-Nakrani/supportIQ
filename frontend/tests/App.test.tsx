import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from '../src/App.js';

describe('App Root Component (Frontend)', () => {
  it('should render the full accessible application shell', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'SupportIQ' })).toBeInTheDocument();
    expect(screen.getByText(/ShopEase Customer Support Assistant/i)).toBeInTheDocument();

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent(/ShopEase is a fictional brand/i);
    expect(footer).toHaveTextContent(/No conversation history stored/i);
  });
});

