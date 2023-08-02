import express from "express";
const router = express.Router();
import { body } from "express-validator";
import passport from "passport";
import { requireAuth, validateRequest } from "../../middleware";
import { authController } from "../../controllers/v1";
import { authLimiter } from "../../helpers/rateLimiter";
import { AUTH_MODE_JWT } from "../../variables";
import { User, AuthProvider } from '../../models';
import { createToken } from '../../helpers/auth';
import { getJwtProviderAuthLifetime, getJwtProviderAuthSecret } from '../../config';
import { ssoController } from "../../ee/controllers/v1";

var GitHubStrategy = require('passport-github').Strategy;
passport.use(new GitHubStrategy({
  passReqToCallback: true,
  clientID: process.env['CLIENT_ID_GITHUB_LOGIN'],
  clientSecret: process.env['CLIENT_SECRET_GITHUB'],
  callbackURL: "/api/v1/auth/github/callback"
},
async (req : express.Request, accessToken : any, refreshToken : any, profile : any, cb : any) => {
  const email = profile.emails[0].value;
  let user = await User.findOne({
    email
  });
  if (!user) {
    user = await new User({
      email: email,
      authProvider: AuthProvider.GITHUB,
      authId: profile.id,
      firstName: profile.displayName,
    }).save();
  }
  const isUserCompleted = true;
  const providerAuthToken = createToken({
    payload: {
      userId: profile.id.toString(),
      email: email,
      isUserCompleted,
      ...(req.query.state ? {
        callbackPort: req.query.state as string
      } : {})
    },
    expiresIn: await getJwtProviderAuthLifetime(),
    secret: await getJwtProviderAuthSecret(),
  });
  req.isUserCompleted = isUserCompleted;
  req.providerAuthToken = providerAuthToken;
  return cb(null, profile);
}
));

router.get('/github', passport.authenticate('github', { failureRedirect: '/login/provider/error', session: false }), ssoController.redirectSSO);

router.get('/github/callback', 
passport.authenticate('github', { failureRedirect: '/login/provider/error', session: false }
),
function(req, res, next) {
  // Successful authentication, redirect home.
  console.log("github success");
  res.redirect(`/login/sso?token=${encodeURIComponent(req.providerAuthToken)}`);
  next();
});

router.post("/token", validateRequest, authController.getNewToken);

router.post( // deprecated (moved to api/v2/auth/login1)
  "/login1",
  authLimiter,
  body("email").exists().trim().notEmpty(),
  body("clientPublicKey").exists().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post( // deprecated (moved to api/v2/auth/login2)
  "/login2",
  authLimiter,
  body("email").exists().trim().notEmpty(),
  body("clientProof").exists().trim().notEmpty(),
  validateRequest,
  authController.login2
);

router.post(
  "/logout",
  authLimiter,
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  authController.logout
);

router.post(
  "/checkAuth",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  authController.checkAuth
);

router.get(
  "/common-passwords",
  authLimiter,
  authController.getCommonPasswords
);

router.delete(
  "/sessions",
  authLimiter,
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }), 
  authController.revokeAllSessions
);

export default router;
