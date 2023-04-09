import express from 'express';
const router = express.Router();
import { param, body } from 'express-validator';
import {
    requireAuth,
    validateRequest
} from '../../middleware';
import { apiKeyDataController } from '../../controllers/v2';
import {
    AUTH_MODE_JWT
} from '../../variables';

router.get(
    '/',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
    apiKeyDataController.getAPIKeyData
);

router.post(
    '/',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
    body('name').exists().trim(),
    body('expiresIn'), // measured in ms
    validateRequest,
    apiKeyDataController.createAPIKeyData
);

router.delete(
    '/:apiKeyDataId',
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
    param('apiKeyDataId').exists().trim(),
    validateRequest,
    apiKeyDataController.deleteAPIKeyData
);

export default router;