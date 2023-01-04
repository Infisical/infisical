import express from 'express';
const router = express.Router();
import {
    requireAuth,
    validateRequest
} from '../../middleware';
import { body } from 'express-validator';
import { apiKeyDataController } from '../../controllers/v2';

router.get(
    '/',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    apiKeyDataController.getAPIKeyData
);

router.post(
    '/',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    body('name').exists().trim(),
    body('expiresIn'), // measured in ms
    validateRequest,
    apiKeyDataController.createAPIKeyData
);

export default router;