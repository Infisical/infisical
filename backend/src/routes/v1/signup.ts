import express from "express";
const router = express.Router();
import { signupController } from "@app/controllers/v1";
import { authLimiter } from "@app/helpers/rateLimiter";

// TODO: consider moving to users/v3/signup

router.post(
  // TODO endpoint: consider moving to v3/users/signup/mail
  "/email/signup",
  authLimiter,
  signupController.beginEmailSignup
);

router.post(
  "/email/verify", // TODO endpoint: consider moving to v3/users/signup/verify
  authLimiter,
  signupController.verifyEmailSignup
);

export default router;
