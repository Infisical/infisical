import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { validateRequest } from '../../middleware';
import { authController } from '../../controllers/v2';
import { authLimiter } from '../../helpers/rateLimiter';

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
    '/mfa',
    authLimiter,
    body('email').exists().trim().notEmpty(),
    body('mfaToken').exists().trim().notEmpty(),
    validateRequest,
    authController.verifyMfaToken
);

export default router;