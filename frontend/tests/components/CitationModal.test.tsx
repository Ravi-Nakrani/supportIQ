import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CitationModal } from '../../src/components/citations/CitationModal.js';
import type { CitationSource } from '../../src/types/chat.js';

describe('CitationModal Component (Frontend)', () => {
  const sampleCitation: CitationSource = {
    id: 'shopease-returns-policy#defective-products#1',
    title: 'ShopEase Returns Policy',
    section: 'Defective Products',
    excerpt: 'Opened products that suffer from a defect may be returned within 30 days.',
  };

  it('should render nothing when citation is null', () => {
    const { container } = render(<CitationModal citation={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render dialog with title, section, chunk ID and excerpt', () => {
    render(<CitationModal citation={sampleCitation} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ShopEase Returns Policy' })).toBeInTheDocument();
    expect(screen.getByText('Defective Products')).toBeInTheDocument();
    expect(
      screen.getByText('shopease-returns-policy#defective-products#1')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /"Opened products that suffer from a defect may be returned within 30 days\."/i
      )
    ).toBeInTheDocument();
  });

  it('should close when close icon button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<CitationModal citation={sampleCitation} onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /Close citation details/i });
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should close when Done button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<CitationModal citation={sampleCitation} onClose={handleClose} />);

    const doneBtn = screen.getByRole('button', { name: 'Done' });
    await user.click(doneBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should close on Escape key press', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<CitationModal citation={sampleCitation} onClose={handleClose} />);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should close when clicking the backdrop overlay', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<CitationModal citation={sampleCitation} onClose={handleClose} />);

    const backdrop = screen.getByRole('presentation');
    await user.click(backdrop);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

