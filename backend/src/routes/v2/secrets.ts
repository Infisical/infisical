import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireWorkspaceAuth,
    requireSecretsAuth,
    validateRequest
} from '../../middleware';
import { query, body } from 'express-validator';
import { secretsController } from '../../controllers/v2';
import { validateClientForSecrets } from '../../helpers/secrets';
import {
    ADMIN,
    MEMBER,
    SECRET_PERSONAL,
    SECRET_SHARED,
    PERMISSION_READ_SECRETS,
    PERMISSION_WRITE_SECRETS
} from '../../variables';
import {
    BatchSecretRequest
} from '../../types/secret';

router.post(
    '/batch',
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey', 'serviceToken']
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'body'
    }),
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('requests')
        .exists()
        .custom(async (requests: BatchSecretRequest[], { req }) => {
            if (Array.isArray(requests)) {
                const secretIds = requests
                    .map((request) => request.secret._id)
                    .filter((secretId) => secretId !== undefined)
                
                if (secretIds.length > 0) {
                    req.secrets = await validateClientForSecrets({
                        authData: req.authData,
                        secretIds,
                        requiredPermissions: []
                    });
                }
            }
        return true;
    }),
    validateRequest,
    secretsController.batchSecrets
);

router.post(
    '/',
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('secrets')
        .exists()
        .custom((value) => {
            if (Array.isArray(value)) {
                // case: create multiple secrets
                if (value.length === 0) throw new Error('secrets cannot be an empty array')
                for (const secret of value) {
                    if (
                        !secret.type ||
                        !(secret.type === SECRET_PERSONAL || secret.type === SECRET_SHARED) ||
                        !secret.secretKeyCiphertext ||
                        !secret.secretKeyIV ||
                        !secret.secretKeyTag ||
                        (typeof secret.secretValueCiphertext !== 'string') ||
                        !secret.secretValueIV ||
                        !secret.secretValueTag
                    ) {
                        throw new Error('secrets array must contain objects that have required secret properties');
                    }
                }
            } else if (typeof value === 'object') {
                // case: update 1 secret
                if (
                    !value.type ||
                    !(value.type === SECRET_PERSONAL || value.type === SECRET_SHARED) ||
                    !value.secretKeyCiphertext ||
                    !value.secretKeyIV ||
                    !value.secretKeyTag ||
                    !value.secretValueCiphertext ||
                    !value.secretValueIV ||
                    !value.secretValueTag
                ) {
                    throw new Error('secrets object is missing required secret properties');
                }
            } else {
                throw new Error('secrets must be an object or an array of objects')
            }

            return true;
        }),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey', 'serviceToken', 'serviceAccount']
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'body',
        locationEnvironment: 'body',
        requiredPermissions: [PERMISSION_WRITE_SECRETS]
    }),
    secretsController.createSecrets
);

router.get(
    '/',
    query('workspaceId').exists().trim(),
    query('environment').exists().trim(),
    query('tagSlugs'),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey', 'serviceToken', 'serviceAccount']
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        locationWorkspaceId: 'query',
        locationEnvironment: 'query',
        requiredPermissions: [PERMISSION_READ_SECRETS]
    }),
    secretsController.getSecrets
);

router.patch(
    '/',
    body('secrets')
        .exists()
        .custom((value) => {
            if (Array.isArray(value)) {
                // case: update multiple secrets
                if (value.length === 0) throw new Error('secrets cannot be an empty array')
                for (const secret of value) {
                    if (
                        !secret.id
                    ) {
                        throw new Error('Each secret must contain a ID property');
                    }
                }
            } else if (typeof value === 'object') {
                // case: update 1 secret
                if (
                    !value.id
                ) {
                    throw new Error('secret must contain a ID property');
                }
            } else {
                throw new Error('secrets must be an object or an array of objects')
            }

            return true;
        }),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey', 'serviceToken', 'serviceAccount']
    }),
    requireSecretsAuth({
        acceptedRoles: [ADMIN, MEMBER],
        requiredPermissions: [PERMISSION_WRITE_SECRETS]
    }),
    secretsController.updateSecrets
);

router.delete(
    '/',
    body('secretIds')
        .exists()
        .custom((value) => {
            // case: delete 1 secret
            if (typeof value === 'string') return true;

            if (Array.isArray(value)) {
                // case: delete multiple secrets
                if (value.length === 0) throw new Error('secrets cannot be an empty array');
                return value.every((id: string) => typeof id === 'string')
            }

            throw new Error('secretIds must be a string or an array of strings');
        })
        .not()
        .isEmpty(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey', 'serviceToken', 'serviceAccount']
    }),
    requireSecretsAuth({
        acceptedRoles: [ADMIN, MEMBER],
        requiredPermissions: [PERMISSION_WRITE_SECRETS]
    }),
    secretsController.deleteSecrets
);

export default router;