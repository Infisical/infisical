import express from 'express';
const router = express.Router();
import {
    requireAuth
} from '../../middleware';
import { usersController } from '../../controllers/v2';

router.get(
    '/me',
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    usersController.getMe
);

export default router;