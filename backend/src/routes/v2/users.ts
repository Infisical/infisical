import express from 'express';
const router = express.Router();
import {
    requireAuth,
    validateRequest
} from '../../middleware';
import { body } from 'express-validator';
import { usersController } from '../../controllers/v2';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_API_KEY
} from '../../variables';

router.get(
    '/me',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    usersController.getMe
);

router.patch(
    '/me/mfa',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    body('isMfaEnabled').exists().isBoolean(),
    validateRequest,
    usersController.updateMyMfaEnabled
);

router.get(
    '/me/organizations',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
    usersController.getMyOrganizations
);

export default router;