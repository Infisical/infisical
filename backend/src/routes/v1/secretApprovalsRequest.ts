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

// router.post(
//     '/add-approver',
//     requireAuth({
//         acceptedAuthModes: ['jwt']
//     }),
//     secretApprovalController.createApprovalRequest
// );

// router.post(
//     '/remove_approver',
//     requireAuth({
//         acceptedAuthModes: ['jwt']
//     }),
//     secretApprovalController.createApprovalRequest
// );

export default router;
