import express from "express";
const router = express.Router();
import { signupController } from "../../controllers/v1";
import { authLimiter } from "../../helpers/rateLimiter";
import { disableSignUpByServerCfg } from "../../middleware";

// TODO: consider moving to users/v3/signup

router.post(
  // TODO endpoint: consider moving to v3/users/signup/mail
  "/email/signup",
  disableSignUpByServerCfg,
  authLimiter,
  signupController.beginEmailSignup
);

router.post(
  "/email/verify", // TODO endpoint: consider moving to v3/users/signup/verify
  disableSignUpByServerCfg,
  authLimiter,
  signupController.verifyEmailSignup
);

export default router;
