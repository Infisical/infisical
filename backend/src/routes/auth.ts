import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireAuth, validateRequest } from '../middleware';
import { authController } from '../controllers';
import { loginLimiter } from '../helpers/rateLimiter';

router.post('/token', validateRequest, authController.getNewToken);

router.post(
  '/login1',
  loginLimiter,
  body('email').exists().trim().notEmpty(),
  body('clientPublicKey').exists().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post(
  '/login2',
  loginLimiter,
  body('email').exists().trim().notEmpty(),
  body('clientProof').exists().trim().notEmpty(),
  validateRequest,
  authController.login2
);

router.post('/logout', requireAuth, authController.logout);
router.post('/checkAuth', requireAuth, authController.checkAuth);

export default router;
