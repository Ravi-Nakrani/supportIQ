import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../src/components/layout/Header.js';

describe('Header Component (Frontend)', () => {
  it('should render brand name, subtitle, and demo badge pills', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'SupportIQ' })).toBeInTheDocument();
    expect(screen.getByText('ShopEase Customer Support Assistant')).toBeInTheDocument();
    expect(screen.getByText('Demo Knowledge Base: ShopEase')).toBeInTheDocument();
    expect(screen.getByText('No Login Required')).toBeInTheDocument();
  });
});

