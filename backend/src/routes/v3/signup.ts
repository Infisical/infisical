import express from "express";
const router = express.Router();
import { signupController } from "@app/controllers/v3";
import { authLimiter } from "@app/helpers/rateLimiter";
import { validateRequest } from "@app/middleware";

router.post(
  "/complete-account/signup", // TODO: consider moving endpoint to v3/users/new/complete-account/signup
  authLimiter,
  validateRequest,
  signupController.completeAccountSignup
);

export default router;
