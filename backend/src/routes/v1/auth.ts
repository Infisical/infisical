import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireAuth, validateRequest } from '../../middleware';
import { authController } from '../../controllers/v1';
import { authLimiter } from '../../helpers/rateLimiter';

router.post('/token', validateRequest, authController.getNewToken);

router.post(
  '/login1',
  authLimiter,
  body('email').exists().trim().notEmpty(),
  body('clientPublicKey').exists().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post(
  '/login2',
  authLimiter,
  body('email').exists().trim().notEmpty(),
  body('clientProof').exists().trim().notEmpty(),
  validateRequest,
  authController.login2
);

router.post(
  '/logout', 
  authLimiter,
  requireAuth({
    acceptedAuthModes: ['jwt']
  }), 
  authController.logout
);

router.post(
  '/checkAuth', 
  requireAuth({
    acceptedAuthModes: ['jwt']
  }), 
  authController.checkAuth
);

export default router;
