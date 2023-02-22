import express from 'express';
const router = express.Router();
import { requireAuth, validateRequest } from '../../middleware';
import { secretApprovalController } from '../../controllers/v1';
import { body, param } from 'express-validator';

router.post(
    '/',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    body('workspaceId').exists(),
    body('environment').exists(),
    body('requestedChanges').isArray(),
    validateRequest,
    secretApprovalController.createApprovalRequest
);

router.get(
    '/',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    secretApprovalController.getAllApprovalRequestsForUser
);

router.post(
    '/:reviewId/approve',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    secretApprovalController.getAllApprovalRequestsForUser
);

router.post(
    '/:reviewId/reject',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    secretApprovalController.getAllApprovalRequestsForUser
);

export default router;
