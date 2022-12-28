import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import { environmentController } from '../../controllers/v2';
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from '../../middleware';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';

router.post(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  body('environmentName').exists().trim(),
  validateRequest,
  environmentController.createWorkspaceEnvironment
);

router.put(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  body('environmentName').exists().trim(),
  body('oldEnvironmentSlug').exists().trim(),
  validateRequest,
  environmentController.renameWorkspaceEnvironment
);

router.delete(
  '/:workspaceId',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN],
    acceptedStatuses: [GRANTED],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  validateRequest,
  environmentController.deleteWorkspaceEnvironment
);

export default router;
