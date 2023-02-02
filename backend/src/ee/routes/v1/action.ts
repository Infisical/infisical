import express from 'express';
const router = express.Router();
import {
    validateRequest
} from '../../../middleware';
import { param } from 'express-validator';
import { actionController } from '../../controllers/v1';

// TODO: put into action controller
router.get(
    '/:actionId',
    param('actionId').exists().trim(),
    validateRequest,
    actionController.getAction
);

export default router;