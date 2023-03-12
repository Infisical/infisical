import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireWorkspaceAuth,
    requireServiceTokenDataAuth,
    validateRequest
} from '../../middleware';
import { param, body } from 'express-validator';
import {
    ADMIN,
    MEMBER,
} from '../../variables';
import { serviceTokenDataController } from '../../controllers/v2';

router.get(
    '/',
    requireAuth({
        acceptedAuthModes: ['serviceToken']
    }),
    serviceTokenDataController.getServiceTokenData
);

router.post(
    '/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        location: 'body'
    }),
    body('name').exists().isString().trim(),
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('encryptedKey').exists().isString().trim(),
    body('iv').exists().isString().trim(),
    body('tag').exists().isString().trim(),
    body('expiresIn').exists().isNumeric(), // measured in ms
    body('permissions').isArray({ min: 1 }).custom((value: string[]) => {
        const allowedPermissions = ['read', 'write'];
        const invalidValues = value.filter((v) => !allowedPermissions.includes(v));
        if (invalidValues.length > 0) {
            throw new Error(`permissions contains invalid values: ${invalidValues.join(', ')}`);
        }

        return true
    }),
    validateRequest,
    serviceTokenDataController.createServiceTokenData
);

router.delete(
    '/:serviceTokenDataId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
    requireServiceTokenDataAuth({
        acceptedRoles: [ADMIN, MEMBER]
    }),
    param('serviceTokenDataId').exists().trim(),
    validateRequest,
    serviceTokenDataController.deleteServiceTokenData
);

export default router;