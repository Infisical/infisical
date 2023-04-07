import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware';
import { userController } from '../../controllers/v1';
import {
    AUTH_MODE_JWT
} from '../../variables';

router.get(
    '/', 
    requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }), 
    userController.getUser
);

export default router;
