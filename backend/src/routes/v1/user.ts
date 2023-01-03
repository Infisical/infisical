import express from 'express';
const router = express.Router();
import { requireAuth } from '../../middleware';
import { userController } from '../../controllers/v1';

router.get(
    '/', 
    requireAuth({
        acceptedAuthModes: ['jwt']
    }), 
    userController.getUser
);

export default router;
