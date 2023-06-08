import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import passport from 'passport';
import { requireAuth, validateRequest } from '../../middleware';
import { authController } from '../../controllers/v1';
import { authLimiter } from '../../helpers/rateLimiter';
import { AUTH_MODE_JWT } from '../../variables';

router.post('/token', validateRequest, authController.getNewToken);

router.post( // deprecated (moved to api/v2/auth/login1)
  '/login1',
  authLimiter,
  body('email').exists().trim().notEmpty(),
  body('clientPublicKey').exists().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post( // deprecated (moved to api/v2/auth/login2)
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
    acceptedAuthModes: [AUTH_MODE_JWT]
  }),
  authController.logout
);

router.post(
  '/checkAuth',
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT]
  }),
  authController.checkAuth
);

router.get(
  '/redirect/google',
  authLimiter,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  }),
);

router.get(
  '/callback/google',
  passport.authenticate('google', { failureRedirect: '/login/provider/error', session: false }),
  authController.handleAuthProviderCallback,
);

router.get(
  '/common-passwords',
  authLimiter,
  authController.getCommonPasswords
);

router.delete(
  '/sessions',
  authLimiter,
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT]
  }), 
  authController.revokeAllSessions
);

export default router;
