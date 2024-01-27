import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { requireMfaAuth, validateRequest } from "../../middleware";
import { authController } from "../../controllers/v2";
import { authLimiter } from "../../helpers/rateLimiter";

router.post(
  // TODO: deprecate (moved to api/v3/auth/login1)
  "/login1",
  authLimiter,
  body("email").isString().trim().notEmpty().toLowerCase(),
  body("clientPublicKey").isString().trim().notEmpty(),
  validateRequest,
  authController.login1
);

router.post(
  // TODO: deprecate (moved to api/v3/auth/login1)
  "/login2",
  authLimiter,
  body("email").isString().trim().notEmpty().toLowerCase(),
  body("clientProof").isString().trim().notEmpty(),
  validateRequest,
  authController.login2
);

//remove above ones after depreciation
router.post("/mfa/send", authLimiter, requireMfaAuth, authController.sendMfaToken);

router.post("/mfa/verify", authLimiter, requireMfaAuth, authController.verifyMfaToken);

export default router;
