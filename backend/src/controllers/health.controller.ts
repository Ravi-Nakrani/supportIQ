import type { Request, Response } from 'express';
import type { IReadinessChecker } from '../services/health/readinessChecker.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  ready?: boolean | undefined;
  timestamp: string;
  version: string;
}

export class HealthController {
  private readonly readinessChecker: IReadinessChecker | undefined;

  constructor(readinessChecker?: IReadinessChecker | undefined) {
    this.readinessChecker = readinessChecker;
  }

  getHealth = async (req: Request, res: Response<HealthResponse>): Promise<void> => {
    const isReadinessRequested = req.query.ready === 'true' || req.query.ready === '1';

    if (!isReadinessRequested) {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
      return;
    }

    if (!this.readinessChecker) {
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
