import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.js';
import * as chatApi from '../src/services/chatApi.js';
import type { ChatResponse, DemoMetadataResponse } from '../src/types/chat.js';
import { ApiClientError } from '../src/services/chatApi.js';

describe('SupportIQ Public Chat Integration (Frontend)', () => {
  const mockDemoMetadata: DemoMetadataResponse = {
    assistantName: 'SupportIQ',
    companyName: 'ShopEase',
    demoNotice: 'Demo Notice: ShopEase is a fictional brand.',
    suggestedQuestions: [
      'What is the return policy for defective products?',
      'How long does standard shipping take?',
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(chatApi, 'getDemoMetadata').mockResolvedValue(mockDemoMetadata);
    vi.spyOn(chatApi, 'checkBackendReadiness').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete the full user journey: starter question -> answer with citation -> follow-up -> reset', async () => {
    const user = userEvent.setup();

    const mockResponse1: ChatResponse = {
      status: 'answered',
      answer: 'Defective products can be returned within 30 days for a full replacement.',
      sources: [
        {
          id: 'shopease-returns-policy#defective#1',
          title: 'ShopEase Returns Policy',
          section: 'Defective Products',
          excerpt: 'Defective items are covered for 30 days.',
        },
      ],
      suggestedFollowUps: ['How long do refunds take?'],
    };

    const mockResponse2: ChatResponse = {
      status: 'answered',
      answer: 'Refunds take 3 to 5 business days after approval.',
      sources: [
        {
          id: 'shopease-refunds-policy#timeline#1',
          title: 'ShopEase Refunds Policy',
          section: 'Processing Timelines',
          excerpt: 'Refunds are processed in 3 to 5 business days.',
        },
      ],
      suggestedFollowUps: [],
    };

    const sendSpy = vi
      .spyOn(chatApi, 'sendChatMessage')
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    await act(async () => {
      render(<App />);
    });

    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();

    const starterBtn = screen.getByRole('button', {
      name: 'What is the return policy for defective products?',
    });
    expect(starterBtn).toBeInTheDocument();

    await user.click(starterBtn);

    expect(
      screen.getByText('What is the return policy for defective products?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Defective products can be returned within 30 days for a full replacement.'
      )
    ).toBeInTheDocument();

    const citationPill = screen.getByRole('button', {
      name: /View citation source: ShopEase Returns Policy — Defective Products/i,
    });
    expect(citationPill).toBeInTheDocument();

    await user.click(citationPill);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('shopease-returns-policy#defective#1')).toBeInTheDocument();
    expect(
      screen.getByText(/"Defective items are covered for 30 days\."/i)
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const followUpBtn = screen.getByRole('button', { name: 'How long do refunds take?' });
    expect(followUpBtn).toBeInTheDocument();

    await user.click(followUpBtn);

    expect(sendSpy).toHaveBeenLastCalledWith(
      {
        message: 'How long do refunds take?',
        history: [
          { role: 'user', content: 'What is the return policy for defective products?' },
          {
            role: 'assistant',
            content:
              'Defective products can be returned within 30 days for a full replacement.',
          },
        ],
      },
      expect.any(AbortSignal)
    );

    expect(
      screen.getByText('Refunds take 3 to 5 business days after approval.')
    ).toBeInTheDocument();

    const newChatBtn = screen.getByRole('button', { name: /Start a new conversation/i });
    expect(newChatBtn).toBeEnabled();

    await user.click(newChatBtn);

    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Refunds take 3 to 5 business days after approval.')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /How can we help with your ShopEase order\?/i })
    ).toBeInTheDocument();
  });

  it('should display error banner on 504 GATEWAY_TIMEOUT and allow retry', async () => {
    const user = userEvent.setup();

    const timeoutError = new ApiClientError(
      'The request timed out while retrieving policy information. Please try again.',
      504,
      'GATEWAY_TIMEOUT'
    );

    const successResponse: ChatResponse = {
      status: 'answered',
      answer: 'Standard shipping takes 3 to 5 business days.',
      sources: [],
    };

    const sendSpy = vi
      .spyOn(chatApi, 'sendChatMessage')
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(successResponse);

    await act(async () => {
      render(<App />);
    });

    const input = screen.getByRole('textbox');
    await user.type(input, 'How long does shipping take?{enter}');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Request Timed Out')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Try Again' });
    await user.click(retryBtn);

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText('Standard shipping takes 3 to 5 business days.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
