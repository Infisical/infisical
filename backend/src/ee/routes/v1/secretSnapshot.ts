import express from 'express';
const router = express.Router();
import {
    requireSecretSnapshotAuth
} from '../../middleware';
import {
    requireAuth,
    validateRequest
} from '../../../middleware';
import { param } from 'express-validator';
import { ADMIN, MEMBER, GRANTED } from '../../../variables';
import { secretSnapshotController } from '../../controllers/v1';

router.get(
    '/:secretSnapshotId',
    requireAuth({
		acceptedAuthModes: ['jwt']
	}),
    requireSecretSnapshotAuth({
        acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
    }),
    param('secretSnapshotId').exists().trim(),
    validateRequest,
    secretSnapshotController.getSecretSnapshot
);

export default router;