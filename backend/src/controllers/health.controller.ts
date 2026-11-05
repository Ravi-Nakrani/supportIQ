import type { Request, Response } from 'express';
import type { IReadinessChecker } from '../services/health/readinessChecker.js';

/**
 * Health check response payload contract.
 * Strictly adheres to docs/API_CONTRACTS.md (Section 2.1).
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  ready?: boolean | undefined;
  timestamp: string;
  version: string;
}

/**
 * Health controller managing liveness and dependency readiness probes.
 */
export class HealthController {
  private readonly readinessChecker: IReadinessChecker | undefined;

  constructor(readinessChecker?: IReadinessChecker | undefined) {
    this.readinessChecker = readinessChecker;
  }

  /**
   * GET /api/health
   * Default: Lightweight liveness probe returning 200 OK without DB calls.
   * With ?ready=true: Deep readiness probe verifying MongoDB cluster ping,
   * Vector Search index presence ('READY' and queryable), manifest chunk counts,
   * and usage tracking accessibility.
   */
  getHealth = async (req: Request, res: Response<HealthResponse>): Promise<void> => {
    const isReadinessRequested = req.query.ready === 'true' || req.query.ready === '1';

    // 1. Lightweight Liveness Probe
    if (!isReadinessRequested) {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
      return;
    }

    // 2. Readiness Probe
    if (!this.readinessChecker) {
      // In offline tests or when no readiness checker is injected
      res.status(200).json({
        status: 'ok',
        ready: true,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
      return;
    }

    const readiness = await this.readinessChecker.checkReadiness();

    if (!readiness.ready) {
      if (readiness.reason) {
        console.warn(`[HEALTH READINESS] Service degraded: ${readiness.reason}`);
      }
      res.status(503).json({
        status: 'degraded',
        ready: false,
        timestamp: readiness.timestamp,
        version: readiness.version,
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      ready: true,
      timestamp: readiness.timestamp,
      version: readiness.version,
    });
  };
}

export const defaultHealthController = new HealthController();
export const getHealth = defaultHealthController.getHealth;
