import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { validateRequest } from "../../middleware";
import { signupController } from "../../controllers/v1";
import { authLimiter } from "../../helpers/rateLimiter";

router.post(
  "/email/signup",
  authLimiter,
  body("email").exists().trim().notEmpty().isEmail(),
  validateRequest,
  signupController.beginEmailSignup
);

router.post(
  "/email/verify",
  authLimiter,
  body("email").exists().trim().notEmpty().isEmail(),
  body("token").exists().trim().notEmpty(),
  validateRequest,
  signupController.verifyEmailSignup
);

export default router;
