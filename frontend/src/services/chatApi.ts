import type {
  ChatRequest,
  ChatResponse,
  DemoMetadataResponse,
  ApiErrorCode,
  ApiErrorEnvelope,
} from '../types/chat.js';

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(message: string, statusCode: number, code: ApiErrorCode, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const FALLBACK_DEMO_METADATA: DemoMetadataResponse = {
  assistantName: 'SupportIQ',
  companyName: 'ShopEase',
  demoNotice: 'This assistant is powered by fictional ShopEase customer service documentation.',
  suggestedQuestions: [
    'What is the return policy for defective products?',
    'How long does standard shipping take?',
    'How long do refunds take after approval?',
    'Can I cancel an order after it has shipped?',
    'How are ShopEase loyalty points earned and redeemed?',
  ],
};

const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '/api';
};

async function parseErrorResponse(response: Response): Promise<ApiClientError> {
  const status = response.status;
  try {
    const data = (await response.json()) as ApiErrorEnvelope;
    if (data && data.error && typeof data.error.message === 'string') {
      return new ApiClientError(
        data.error.message,
        status,
        data.error.code || 'INTERNAL_ERROR',
        data.error.details
      );
    }
  } catch {
  }

  let fallbackCode: ApiErrorCode = 'INTERNAL_ERROR';
  let fallbackMessage = 'An unexpected server error occurred.';

  if (status === 400) {
    fallbackCode = 'BAD_REQUEST';
    fallbackMessage = 'The request was invalid.';
  } else if (status === 413) {
    fallbackCode = 'PAYLOAD_TOO_LARGE';
    fallbackMessage = 'Request payload exceeds the allowed size.';
  } else if (status === 429) {
    fallbackCode = 'RATE_LIMITED';
    fallbackMessage = 'Too many requests. Please wait a moment before trying again.';
  } else if (status === 503) {
    fallbackCode = 'SERVICE_UNAVAILABLE';
    fallbackMessage =
      'The assistant service is currently handling maximum concurrent requests or unavailable. Please try again shortly.';
  } else if (status === 504) {
    fallbackCode = 'GATEWAY_TIMEOUT';
    fallbackMessage = 'The request timed out while retrieving policy information. Please try again.';
  }

  return new ApiClientError(fallbackMessage, status, fallbackCode);
}

export async function getDemoMetadata(signal?: AbortSignal): Promise<DemoMetadataResponse> {
  const url = `${getBaseUrl()}/demo`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    return (await response.json()) as DemoMetadataResponse;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof ApiClientError) {
      throw err;
    }
    throw new ApiClientError(
      'Unable to connect to the SupportIQ server. Please check your network connection.',
      0,
      'NETWORK_ERROR'
    );
  }
}

export async function checkBackendReadiness(signal?: AbortSignal): Promise<boolean> {
  const url = `${getBaseUrl()}/health?ready=true`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { status?: string; ready?: boolean };
    return data.status === 'ok' && data.ready === true;
  } catch {
    return false;
  }
}

export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const url = `${getBaseUrl()}/chat`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    return (await response.json()) as ChatResponse;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof ApiClientError) {
      throw err;
    }
    throw new ApiClientError(
      'Unable to connect to the SupportIQ server. Please check your network connection.',
      0,
      'NETWORK_ERROR'
    );
  }
}

