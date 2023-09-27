import express from "express";
import { authController } from "../../controllers/v3";
import { authLimiter, mfaLimiter } from "../../helpers/rateLimiter";

const router = express.Router();

router.post("/login1", authLimiter, authController.login1);

router.post("/login2", authLimiter, authController.login2);

router.post(
  "/mfa/auth-app/verify/totp",
  mfaLimiter,
  authController.verifyMfaAuthAppTotp
);

router.post(
  "/mfa/auth-app/verify/key",
  mfaLimiter,
  authController.verifyMfaAuthAppSecretKey
);

router.post(
  "/mfa/recovery-codes/verify",
  mfaLimiter,
  authController.verifyMfaRecoveryCode
);

export default router;
