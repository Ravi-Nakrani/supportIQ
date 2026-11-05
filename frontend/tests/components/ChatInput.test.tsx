import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../../src/components/chat/ChatInput.js';

describe('ChatInput Component (Frontend)', () => {
  it('should render textarea with placeholder and character counter', () => {
    render(<ChatInput onSubmit={vi.fn()} />);

    const textarea = screen.getByRole('textbox', {
      name: /Ask a question about ShopEase policies/i,
    });
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText('0 / 1000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send question/i })).toBeDisabled();
  });

  it('should update character count as user types', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={vi.fn()} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello ShopEase');

    expect(screen.getByText('14 / 1000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send question/i })).not.toBeDisabled();
  });

  it('should submit on Enter key and clear input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    render(<ChatInput onSubmit={handleSubmit} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Can I return an item?{enter}');

    expect(handleSubmit).toHaveBeenCalledWith('Can I return an item?');
    expect(textarea).toHaveValue('');
  });

  it('should allow newline on Shift + Enter without submitting', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    render(<ChatInput onSubmit={handleSubmit} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1{Shift>}{enter}{/Shift}Line 2');

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });

  it('should disable textarea and button when disabled prop is true', () => {
    render(<ChatInput onSubmit={vi.fn()} disabled={true} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send question/i })).toBeDisabled();
  });
});

