import express from "express";
const router = express.Router();
import { requireAuth, validateRequest } from "../../middleware";
import { authController } from "../../controllers/v1";
import { authLimiter } from "../../helpers/rateLimiter";
import { AuthMode } from "../../variables";

router.post("/token", validateRequest, authController.getNewToken);

router.post(
  // TODO endpoint: deprecate (moved to api/v3/auth/login1)
  "/login1",
  authLimiter,
  authController.login1
);

router.post(
  // TODO endpoint: deprecate (moved to api/v3/auth/login2)
  "/login2",
  authLimiter,
  authController.login2
);

router.post(
  "/logout",
  authLimiter,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.logout
);

router.post(
  "/checkAuth",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.checkAuth
);

router.delete(
  // TODO endpoint: deprecate (moved to DELETE v2/users/me/sessions)
  "/sessions",
  authLimiter,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.revokeAllSessions
);

// --- identity endpoints

router.post(
  "/token/renew", 
  authController.renewAccessToken
);

router.post(
  "/universal-auth/login",
  authController.loginIdentityUniversalAuth
);

router.post(
  "/universal-auth/identities/:identityId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.addIdentityUniversalAuth
);

router.patch(
  "/universal-auth/identities/:identityId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.updateIdentityUniversalAuth
);

router.get(
  "/universal-auth/identities/:identityId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.getIdentityUniversalAuth
);

router.post(
  "/universal-auth/identities/:identityId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.createUniversalAuthClientSecret
);

router.get(
  "/universal-auth/identities/:identityId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.getUniversalAuthClientSecrets
);

router.delete(
  "/universal-auth/identities/:identityId/client-secrets/:clientSecretId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  authController.revokeUniversalAuthClientSecret
);

export default router;
