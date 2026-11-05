import { Request, Response, NextFunction } from 'express';
import { SupportIQGraphService } from '../graph/supportiqGraph.js';
import { IUsageTracker, UsageReservation } from '../services/usage/types.js';
import { chatRequestSchema } from '../validators/chat.validator.js';
import { calculateActualCostMicroUsd } from '../config/llmPricing.js';

export const CHAT_REQUEST_DEADLINE_MS = 25000;

export interface ChatControllerDependencies {
  graphService: SupportIQGraphService;
  usageTracker: IUsageTracker;
  chatModel?: string | undefined;
  embeddingModel?: string | undefined;
}

export class ChatController {
  private readonly graphService: SupportIQGraphService;
  private readonly usageTracker: IUsageTracker;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(deps: ChatControllerDependencies) {
    this.graphService = deps.graphService;
    this.usageTracker = deps.usageTracker;
    this.chatModel = deps.chatModel ?? 'gpt-6-luna';
    this.embeddingModel = deps.embeddingModel ?? 'text-embedding-3-small';
  }

  async handleChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parseResult = chatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issueDetails = parseResult.error.issues
        .map((issue) => issue.message)
        .join(' ');
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Validation failed: ${issueDetails}`,
        },
      });
      return;
    }

    const { message, history } = parseResult.data;

    let reservation: UsageReservation;
    try {
      reservation = await this.usageTracker.checkAndReserve();
    } catch (trackerErr: unknown) {
      console.error('[CHAT ERROR] Usage tracker reservation failure (failing closed):', trackerErr);
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The assistant service is currently unavailable. Please try again shortly.',
        },
      });
      return;
    }

    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: 'USAGE_LIMIT_EXCEEDED',
          message:
            'The daily public demo limit has been reached. Please check back tomorrow.',
        },
      });
      return;
    }

    const clientAbortController = new AbortController();
    const serverTimeoutController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;

    const onSocketClose = () => {
      if (!res.writableEnded) {
        clientAbortController.abort('CLIENT_DISCONNECTED');
      }
    };
    res.once('close', onSocketClose);

    if (req.aborted || (req.destroyed && !req.complete)) {
      clientAbortController.abort('REQUEST_STREAM_INCOMPLETE');
    }

    const combinedSignal = AbortSignal.any([
      serverTimeoutController.signal,
      clientAbortController.signal,
    ]);

    try {
      timeoutTimer = setTimeout(() => {
        serverTimeoutController.abort('REQUEST_DEADLINE_EXCEEDED');
      }, CHAT_REQUEST_DEADLINE_MS);

      const result = await this.graphService.execute({
        question: message,
        history,
        signal: combinedSignal,
        timeoutMs: CHAT_REQUEST_DEADLINE_MS,
      });

      const isTerminalSuccess =
        result.status === 'answered' || result.status === 'insufficient_evidence';
      const hasCompleteUsage =
        result.usage?.isComplete === true &&
        typeof result.usage.totalTokens === 'number' &&
        !serverTimeoutController.signal.aborted &&
        !clientAbortController.signal.aborted;

      if (isTerminalSuccess && hasCompleteUsage && result.usage) {
        try {
          const actualCostMicroUsd = calculateActualCostMicroUsd(
            this.chatModel,
            this.embeddingModel,
            result.usage
          );
          await this.usageTracker.reconcileUsage({
            dateKey: reservation.dateKey,
            reservedTokens: reservation.reservedTokens,
            reservedCostMicroUsd: reservation.reservedCostMicroUsd,
            actualTokens: result.usage.totalTokens,
            actualCostMicroUsd,
            isComplete: true,
          });
        } catch (reconcileErr) {
          console.error('[CHAT ERROR] Reconciliation error (reservation retained):', reconcileErr);
        }
      } else {
        try {
          await this.usageTracker.reconcileUsage({
            dateKey: reservation.dateKey,
            reservedTokens: reservation.reservedTokens,
            reservedCostMicroUsd: reservation.reservedCostMicroUsd,
            isComplete: false,
          });
        } catch (reconcileErr) {
          console.error('[CHAT ERROR] Reconciliation retention error:', reconcileErr);
        }
      }

      if (
        res.writableEnded ||
        res.destroyed ||
        clientAbortController.signal.aborted
      ) {
        return;
      }

      if (result.status === 'answered') {
        res.status(200).json({
          status: 'answered',
          answer: result.answer,
          sources: result.sources,
          suggestedFollowUps: result.suggestedFollowUps,
        });
        return;
      }

      if (result.status === 'insufficient_evidence') {
        res.status(200).json({
          status: 'insufficient_evidence',
          answer: result.answer,
          sources: [],
          suggestedFollowUps: result.suggestedFollowUps,
        });
        return;
      }

      if (result.status === 'timeout' || serverTimeoutController.signal.aborted) {
        res.status(504).json({
          error: {
            code: 'GATEWAY_TIMEOUT',
            message:
              'The request timed out while retrieving policy information. Please try again.',
          },
        });
        return;
      }

      if (result.status === 'aborted') {
        res.status(400).json({
          error: {
            code: 'REQUEST_ABORTED',
            message: 'The request was cancelled before completion.',
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'An error occurred while processing your request. Please try again shortly.',
        },
      });
    } catch (err: unknown) {
      if (!res.writableEnded && !res.destroyed) {
        next(err);
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      res.removeListener('close', onSocketClose);
    }
  }
}
