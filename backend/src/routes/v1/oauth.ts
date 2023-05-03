import express from 'express';
const router = express.Router();
import passport from 'passport';
import { oauthController } from '../../controllers/v1';
import { authLimiter } from '../../helpers/rateLimiter';

router.get(
    '/redirect/google',
    authLimiter,
    passport.authenticate('google', {
      scope: ['profile', 'email'],
    }),
  )
  
router.get(
    '/callback/google',
    passport.authenticate('google', { failureRedirect: '/error', session: false }),
    oauthController.handleAuthProviderCallback,
)

export default router;
