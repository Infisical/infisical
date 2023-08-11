import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { validateRequest } from "../../middleware";
import { signupController } from "../../controllers/v1";
import { authLimiter } from "../../helpers/rateLimiter";

// TODO: consider moving to users/v3/signup

router.post( // TODO endpoint: consider moving to v3/users/signup/mail
	"/email/signup",
	authLimiter,
	body("email").exists().trim().notEmpty().isEmail(),
	validateRequest,
	signupController.beginEmailSignup
);

router.post(
	"/email/verify", // TODO endpoint: consider moving to v3/users/signup/verify
	authLimiter,
	body("email").exists().trim().notEmpty().isEmail(),
	body("code").exists().trim().notEmpty(),
	validateRequest,
	signupController.verifyEmailSignup
);

export default router;