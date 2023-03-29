import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireOrganizationAuth,
    requireWorkspaceAuth,
    requireServiceAccountAuth,
    requireServiceAccountWorkspacePermissionAuth,
    validateRequest
} from '../../middleware';
import { param, query, body } from 'express-validator';
import {
    OWNER,
    ADMIN,
    MEMBER,
    ACCEPTED
} from '../../variables';
import { serviceAccountsController } from '../../controllers/v2';

router.get(
    '/:serviceAccountId',
    param('serviceAccountId').exists().isString().trim(),
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.getServiceAccount
);

router.post(
    '/',
    body('organizationId').exists().isString().trim(),
    body('name').exists().isString().trim(),
    body('publicKey').exists().isString().trim(),
    body('expiresIn').isNumeric(), // measured in ms
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
        location: 'body'
    }),
    serviceAccountsController.createServiceAccount
);

router.patch(
    '/:serviceAccountId/name',
    param('serviceAccountId').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.changeServiceAccountName
);

router.delete(
    '/:serviceAccountId',
    param('serviceAccountId').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.deleteServiceAccount
);

// router.get(
//     '/:serviceAccountId/permissions/organization',
//     param('serviceAccountId').exists().isString().trim(),
//     query('offset').exists(),
//     query('limit').exists(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: ['jwt']
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED]
//     }),
//     serviceAccountsController.getServiceAccountOrganizationPermission
// );

router.get(
    '/:serviceAccountId/permissions/workspace',
    param('serviceAccountId').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.getServiceAccountWorkspacePermissions
);

// router.post(
//     '/:serviceAccountId/permissions/organization',
//     param('serviceAccountId').exists().isString().trim(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: ['jwt']
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED]
//     }),
//     serviceAccountsController.addServiceAccountOrganizationPermission
// );

router.post(
    '/:serviceAccountId/permissions/workspace',
    param('serviceAccountId').exists().isString().trim(),
    body('workspaceId').exists().isString().notEmpty(),
    body('environment').exists().isString().notEmpty(),
    body('canRead').isBoolean().optional(),
    body('canWrite').isBoolean().optional(),
    body('canUpdate').isBoolean().optional(),
    body('canDelete').isBoolean().optional(),
    body('encryptedKey').exists().isString().notEmpty(),
    body('nonce').exists().isString().notEmpty(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        location: 'body'
    }),
    serviceAccountsController.addServiceAccountWorkspacePermission 
);

router.delete(
    '/:serviceAccountId/permissions/workspace/:serviceAccountWorkspacePermissionId',
    param('serviceAccountId').exists().isString().trim(),
    param('serviceAccountWorkspacePermissionId').exists().isString().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }), 
    requireServiceAccountWorkspacePermissionAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.deleteServiceAccountWorkspacePermission
);

// router.post(
//     '/:serviceAccountId/key',
//     body('workspaceId').exists().isString().trim(),
//     body('encryptedKey').exists().isString().trim(),
//     body('nonce').exists().isString().trim(),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN, MEMBER],
//         acceptedStatuses: [ACCEPTED]
//     }),
//     serviceAccountsController.addServiceAccountKey
// );

export default router;