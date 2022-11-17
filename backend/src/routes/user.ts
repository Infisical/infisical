import express from 'express';
const router = express.Router();
import { requireAuth } from '../middleware';
import { userController } from '../controllers';

router.get('/', requireAuth, userController.getUser);

export default router;
