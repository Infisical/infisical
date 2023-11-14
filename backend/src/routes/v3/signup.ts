import express from "express";
const router = express.Router();
import { signupController } from "../../controllers/v3";
import { authLimiter } from "../../helpers/rateLimiter";
import { disableSignUpByServerCfg, validateRequest } from "../../middleware";

router.post(
  "/complete-account/signup", // TODO: consider moving endpoint to v3/users/new/complete-account/signup
  disableSignUpByServerCfg,
  authLimiter,
  validateRequest,
  signupController.completeAccountSignup
);

export default router;
