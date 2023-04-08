import express from 'express';
const router = express.Router();
import {
    requireAuth, validateRequest
} from '../../middleware';
import { body } from 'express-validator';

router.post(
    '/',
    body('workspaceId').exists().isString().trim(),
    body('environment').exists().isString().trim(),
    body('secretType').exists().isString(),
    validateRequest,
    async (req, res) => {
        return;
    }
);

export default router;