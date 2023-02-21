import express from 'express';
const router = express.Router();
import {
    requireAuth,
    validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { usersController } from '../../controllers/v2';

router.get(
    '/me',
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    usersController.getMe
);

router.patch(
    '/me/mfa',
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    body('isMfaEnabled').exists().isBoolean(),
    validateRequest,
    usersController.updateMyMfaEnabled
);

router.get(
    '/me/organizations',
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    usersController.getMyOrganizations
);

export default router;