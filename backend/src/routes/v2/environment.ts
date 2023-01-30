import express, { Response, Request } from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import { environmentController } from '../../controllers/v2';
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';

router.post(
  '/:workspaceId/environments',
  requireAuth({
    acceptedAuthModes: ['jwt'],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  body('environmentName').exists().trim(),
  validateRequest,
  environmentController.createWorkspaceEnvironment
);

router.put(
  '/:workspaceId/environments',
  requireAuth({
    acceptedAuthModes: ['jwt'],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  body('environmentName').exists().trim(),
  body('oldEnvironmentSlug').exists().trim(),
  validateRequest,
  environmentController.renameWorkspaceEnvironment
);

router.delete(
  '/:workspaceId/environments',
  requireAuth({
    acceptedAuthModes: ['jwt'],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN],
  }),
  param('workspaceId').exists().trim(),
  body('environmentSlug').exists().trim(),
  validateRequest,
  environmentController.deleteWorkspaceEnvironment
);

router.get(
  '/:workspaceId/environments',
  requireAuth({
    acceptedAuthModes: ['jwt'],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
  }),
  param('workspaceId').exists().trim(),
  validateRequest,
  environmentController.getAllAccessibleEnvironmentsOfWorkspace
);

export default router;
