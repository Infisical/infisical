import express, { Response, Request } from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import { tagController } from '../../controllers/v2';
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest
} from '../../middleware';
import { 
  ADMIN, 
  MEMBER,
  AUTH_MODE_JWT
} from '../../variables';

router.get(
  '/:workspaceId/tags',
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: 'params'
  }),
  param('workspaceId').exists().trim(),
  validateRequest,
  tagController.getWorkspaceTags
);

router.delete(
  '/tags/:tagId',
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  param('tagId').exists().trim(),
  validateRequest,
  tagController.deleteWorkspaceTag
);

router.post(
  '/:workspaceId/tags',
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: 'params'
  }),
  param('workspaceId').exists().trim(),
  body('name').exists().trim(),
  body('slug').exists().trim(),
  validateRequest,
  tagController.createWorkspaceTag
);

export default router;
