import express from 'express';
const router = express.Router();
import {
    requireAuth, 
    requireWorkspaceAuth,
    validateRequest
} from '../../middleware';
import { body, param, query } from 'express-validator';
import { secretsController } from '../../controllers/v3';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_API_KEY,
    ADMIN,
    MEMBER,
    PERMISSION_WRITE_SECRETS,
    SECRET_SHARED,
    SECRET_PERSONAL,
    PERMISSION_READ_SECRETS
} from '../../variables';

router.get(
    '/',
    query('workspaceId').exists().isString().trim(),
    query('environment').exists().isString().trim(),
    query('tagSlugs'),
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'query',
        locationEnvironment: 'query',
        requiredPermissions: [PERMISSION_READ_SECRETS],
        requireBlindIndicesEnabled: true,
    }),
    secretsController.getSecrets
);

router.post(
    '/:secretName',
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('type').exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
    body('secretKeyCiphertext').exists().isString().trim(),
    body('secretKeyIV').exists().isString().trim(),
    body('secretKeyTag').exists().isString().trim(),
    body('secretValueCiphertext').exists().isString().trim(),
    body('secretValueIV').exists().isString().trim(),
    body('secretValueTag').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'body',
        locationEnvironment: 'body',
        requiredPermissions: [PERMISSION_WRITE_SECRETS],
        requireBlindIndicesEnabled: true,
    }),
    secretsController.createSecret
);

router.get(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    query('workspaceId').exists().isString().trim(),
    query('environment').exists().isString().trim(),
    query('type').optional().isIn([SECRET_SHARED, SECRET_PERSONAL]),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'query',
        locationEnvironment: 'query',
        requiredPermissions: [PERMISSION_READ_SECRETS],
        requireBlindIndicesEnabled: true,
    }),
    secretsController.getSecretByName
);

router.patch(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('type').exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
    body('secretValueCiphertext').exists().isString().trim(),
    body('secretValueIV').exists().isString().trim(),
    body('secretValueTag').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'body',
        locationEnvironment: 'body',
        requiredPermissions: [PERMISSION_WRITE_SECRETS],
        requireBlindIndicesEnabled: true,
    }),
    secretsController.updateSecretByName
);

router.delete(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('type').exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'body',
        locationEnvironment: 'body',
        requiredPermissions: [PERMISSION_WRITE_SECRETS],
        requireBlindIndicesEnabled: true,
    }),
    secretsController.deleteSecretByName 
);

export default router;