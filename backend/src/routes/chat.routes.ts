import { Router, RequestHandler } from 'express';
import { ChatController } from '../controllers/chat.controller.js';

export interface ChatRouterDependencies {
  chatController: ChatController;
  rateLimiter: RequestHandler;
  concurrencyLimiter: RequestHandler;
}

export function createChatRouter(deps: ChatRouterDependencies): Router {
  const router = Router();

  router.post(
    '/',
    deps.rateLimiter,
    deps.concurrencyLimiter,
    (req, res, next) => {
      deps.chatController.handleChat(req, res, next).catch(next);
    }
  );

  return router;
}

