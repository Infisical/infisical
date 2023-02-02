import express from 'express';
import { 
  requireAuth, 
  requireWorkspaceAuth,
  requireSecretAuth,
  validateRequest 
} from '../../middleware';
import { body, param, query } from 'express-validator';
import { ADMIN, MEMBER } from '../../variables';
import { CreateSecretRequestBody, ModifySecretRequestBody } from '../../types/secret';
import { secretController } from '../../controllers/v2';

// note to devs: stop supporting these routes [deprecated]

const router = express.Router();

router.post(
  '/batch-create/workspace/:workspaceId/environment/:environment',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  param('workspaceId').exists().isMongoId().trim(),
  param('environment').exists().trim(),
  body('secrets').exists().isArray().custom((value) => value.every((item: CreateSecretRequestBody) => typeof item === 'object')),
  body('channel'),
  validateRequest,
  secretController.createSecrets
);

router.post(
  '/workspace/:workspaceId/environment/:environment',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  param('workspaceId').exists().isMongoId().trim(),
  param('environment').exists().trim(),
  body('secret').exists().isObject(),
  body('channel'),
  validateRequest,
  secretController.createSecret
);

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
  query('channel'),
  validateRequest,
  secretController.getSecrets
);

router.get(
  '/:secretId',
  requireAuth({
    acceptedAuthModes: ['jwt', 'serviceToken']
  }),
  requireSecretAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  secretController.getSecret
);

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
  secretController.deleteSecrets
);

router.delete(
  '/:secretId',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  requireSecretAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  param('secretId').isMongoId(),
  validateRequest,
  secretController.deleteSecret
);

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
  secretController.updateSecrets
);


router.patch(
  '/workspace/:workspaceId/environment/:environmentName',
  requireAuth({
    acceptedAuthModes: ['jwt']
  }),
  body('secret').isObject(),
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  validateRequest,
  secretController.updateSecret
);

export default router;
