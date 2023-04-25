import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import passport from 'passport';
import { requireAuth, validateRequest } from '../../middleware';
import { authController } from '../../controllers/v1';
import { authLimiter } from '../../helpers/rateLimiter';
import { AUTH_MODE_JWT } from '../../variables';
import { User } from '../../models';
import { createToken } from '../../helpers/auth';
import { getJwtProviderAuthLifetime, getJwtProviderAuthSecret } from '../../config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleStrategy = require('passport-google-oidc');

passport.use(new GoogleStrategy({
  passReqToCallback: true,
  clientID: process.env['GOOGLE_CLIENT_ID'],
  clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
  callbackURL: '/api/v1/auth/google/callback',
}, async (req: express.Request, issuer: any, profile: any, cb: any) => {
  const email = profile.emails[0].value;
  let user = await User.findOne({
    authProvider: issuer,
    authId: profile.id,
  })

  if (!user) {
    user = await new User({
      email,
      authProvider: issuer,
      authId: profile.id,
    }).save();
  }

  const providerAuthToken = createToken({
    payload: {
      userId: user._id.toString(),
      email: user.email,
    },
    expiresIn: getJwtProviderAuthLifetime(),
    secret: getJwtProviderAuthSecret(),
  });

  req.providerAuthToken = providerAuthToken;
  cb(null, profile);
}));

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
  '/login/federated/google',
  authLimiter,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  }),
)

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/error', session: false }),
  authController.handleGoogleCallback,
)

export default router;
