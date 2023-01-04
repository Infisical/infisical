import express from 'express';
import { requireAuth, requireWorkspaceAuth, validateRequest } from '../../middleware';
import { body, param } from 'express-validator';
import { ADMIN, MEMBER } from '../../variables';
import { CreateSecretRequestBody, ModifySecretRequestBody } from '../../types/secret/types';
import { secretController } from '../../controllers/v2';

const router = express.Router();

/**
 * Create many secrets for a given workspace and environmentName
 */
router.post(
  '/batch-create/workspace/:workspaceId/environment/:environmentName',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  body('secrets').exists().isArray().custom((value) => value.every((item: CreateSecretRequestBody) => typeof item === 'object')),
  validateRequest,
  secretController.batchCreateSecrets
);

/**
 * Get a single secret by secret id
 */
router.get(
  '/:secretId', requireAuth, param('secretId').exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  secretController.createSingleSecret
);

/**
 * Batch delete secrets in a given workspace and environment name
 */
router.delete(
  '/batch/workspace/:workspaceId/environment/:environmentName',
  requireAuth,
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  body('secretIds').exists().isArray().custom(array => array.length > 0),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  secretController.batchDeleteSecrets

);

/**
 * Apply modifications to many existing secrets in a given workspace and environment
 */
router.patch(
  '/batch-modify/workspace/:workspaceId/environment/:environmentName',
  requireAuth,
  body('secrets').exists().isArray().custom((secrets: ModifySecretRequestBody[]) => secrets.length > 0),
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  secretController.batchModifySecrets
);

export default router;
