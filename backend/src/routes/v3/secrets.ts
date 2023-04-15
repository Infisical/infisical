import express from 'express';
const router = express.Router();
import {
    requireAuth, validateRequest
} from '../../middleware';
import { body, param, query } from 'express-validator';
import { secretsController } from '../../controllers/v3';

// note: future endpoints pending brainstorm + implementation

router.get(
    '/',
    query('workspaceId').exists().isString().trim(),
    query('environment').exists().isString().trim(),
    query('tagSlugs'),
    secretsController.getSecrets
);

router.post(
    '/:secretName',
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('secretKeyCiphertext').exists().isString().trim(),
    body('secretKeyIV').exists().isString().trim(),
    body('secretKeyTag').exists().isString().trim(),
    body('secretValueCiphertext').exists().isString().trim(),
    body('secretValueIV').exists().isString().trim(),
    body('secretValueTag').exists().isString().trim(),
    validateRequest,
    secretsController.createSecret
);

router.get(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    query('workspaceId').exists().isString().trim(),
    query('environment').exists().isString().trim(),
    secretsController.getSecretByName
);

router.patch(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    query('workspaceId').exists().isString().trim(),
    query('environment').exists().isString().trim(),
    validateRequest,
    secretsController.updateSecretByName
);

router.delete(
    '/:secretName',
    param('secretName').exists().isString().trim(),
    query('workspaceId').exists().isString().trim(),
    validateRequest,
    secretsController.deleteSecretByName 
);

export default router;