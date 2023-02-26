import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireMfaAuth, validateRequest } from '../../middleware';
import { authController } from '../../controllers/v2';
import { authLimiter } from '../../helpers/rateLimiter';

router.post(
  '/login1',
  authLimiter,
  body('email').isString().trim().notEmpty(),
  body('clientPublicKey').isString().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post(
  '/login2',
  authLimiter,
  body('email').isString().trim().notEmpty(),
  body('clientProof').isString().trim().notEmpty(),
  validateRequest,
  authController.login2
);

router.post(
  '/mfa/send',
  authLimiter,
  body('email').isString().trim().notEmpty(),
  validateRequest,
  authController.sendMfaToken
);

router.post(
  '/mfa/verify',
  authLimiter,
  requireMfaAuth,
  body('email').isString().trim().notEmpty(),
  body('mfaToken').isString().trim().notEmpty(),
  validateRequest,
  authController.verifyMfaToken
);

export default router;