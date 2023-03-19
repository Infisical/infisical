import express from 'express';
const router = express.Router();
import {
    requireOrganizationAuth,
    requireWorkspaceAuth,
    requireServiceAccountAuth,
    validateRequest
} from '../../middleware';
import { body } from 'express-validator';
import {
    OWNER,
    ADMIN,
    MEMBER,
    ACCEPTED,
    PERMISSION_SA_SET
} from '../../variables';
import { serviceAccountsController } from '../../controllers/v2';

router.post(
    '/',
    body('organizationId').exists().isString().trim(),
    body('name').exists().isString().trim(),
    body('publicKey').exists().isString().trim(),
    body('expiresIn'), // measured in ms
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
        location: 'body'
    }),
    serviceAccountsController.createServiceAccount
);

router.post(
    '/serviceAccountId/:serviceAccountId/permissions',
    body('name').exists().isString().trim().custom((value) => PERMISSION_SA_SET.has(value)),
    body('workspaceId').optional().isMongoId(),
    body('environment').optional(),
    validateRequest,
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    serviceAccountsController.addServiceAccountPermission
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

router.delete(
    '/:serviceAccountId/key/:serviceAccountKeyId',
    requireServiceAccountAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    async (req, res) => {
        // TODO: delete service account key id
    }
);

// TODO: create service account permission
// router.post(
    
// );

// TODO: delete service account permission

router.delete(
    '/:serviceAccountId/service-account-permission/:serviceAccountPermissionId',

)


export default router;