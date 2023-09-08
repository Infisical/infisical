import express from "express";
const router = express.Router();
import { requireAuth, requireSignupAuth } from "../../middleware";
import { passwordController } from "../../controllers/v1";
import { passwordLimiter } from "../../helpers/rateLimiter";
import { AuthMode } from "../../variables";

router.post(
  "/srp1",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  passwordController.srp1
);

router.post(
  "/change-password",
  passwordLimiter,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  passwordController.changePassword
);

router.post("/email/password-reset", passwordLimiter, passwordController.emailPasswordReset);

router.post(
  "/email/password-reset-verify",
  passwordLimiter,
  passwordController.emailPasswordResetVerify
);

router.get(
  "/backup-private-key",
  passwordLimiter,
  requireSignupAuth,
  passwordController.getBackupPrivateKey
);

router.post(
  "/backup-private-key",
  passwordLimiter,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  passwordController.createBackupPrivateKey
);

router.post("/password-reset", requireSignupAuth, passwordController.resetPassword);

export default router;
