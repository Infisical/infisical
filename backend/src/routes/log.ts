import express from 'express';
const router = express.Router();
import {
    requireAuth,
    validateRequest
} from '../middleware';
import { logController } from '../controllers';

// TODO: workspaceId validation
router.get(
    '/:workspaceId',
    requireAuth,
    validateRequest,
    logController.getLogs
);

export default router;