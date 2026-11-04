import type { Request, Response } from 'express';

/**
 * Health check response payload contract.
 * Strictly adheres to docs/API_CONTRACTS.md (Section 2.1).
 */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

/**
 * GET /api/health
 * Public liveness probe returning service status.
 * Never exposes credentials, database status, or environment variables.
 */
export function getHealth(_req: Request, res: Response<HealthResponse>): void {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}

