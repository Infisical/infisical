import express, { Request, Response } from 'express';
import { requireAuth, requireWorkspaceAuth, validateRequest } from '../../middleware';
import { body, param, query } from 'express-validator';
import { ADMIN, MEMBER } from '../../variables';
import { CreateSecretRequestBody, ModifySecretRequestBody } from '../../types/secret';
import { secretController } from '../../controllers/v2';
import { fetchAllSecrets } from '../../controllers/v2/secretController';

const router = express.Router();

/**
 * Create many secrets for a given workspace and environmentName
 */
router.post(
  '/batch-create/workspace/:workspaceId/environment/:environmentName',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
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
 * Get all secrets for a given environment and workspace id
 */
router.get(
  '/workspace/:workspaceId',
  param('workspaceId').exists().trim(),
  query("environment").exists(),
  requireAuth({
    acceptedAuthModes: ['jwt', 'serviceToken']
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  fetchAllSecrets
);

/**
 * Batch delete secrets in a given workspace and environment name
 */
router.delete(
  '/batch/workspace/:workspaceId/environment/:environmentName',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
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
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
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
