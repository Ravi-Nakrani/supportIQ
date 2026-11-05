import { Router } from 'express';
import { getDemoMetadata } from '../controllers/demo.controller.js';

export const demoRouter: Router = Router();

demoRouter.get('/', getDemoMetadata);

