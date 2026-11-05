import { Router } from 'express';
import { HealthController, defaultHealthController } from '../controllers/health.controller.js';

export interface HealthRouterOptions {
  healthController?: HealthController | undefined;
}

export function createHealthRouter(options?: HealthRouterOptions): Router {
  const router: Router = Router();
  const controller = options?.healthController ?? defaultHealthController;

  // GET /api/health
  router.get('/', controller.getHealth);

  return router;
}

export const healthRouter: Router = createHealthRouter();
