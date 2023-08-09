import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { signupController } from "../../controllers/v3";
import { authLimiter } from "../../helpers/rateLimiter";
import { validateRequest } from "../../middleware";

router.post(
    "/complete-account/signup", // TODO: consider moving endpoint to v3/users/new/complete-account/signup
    authLimiter,
    body("email").exists().isString().trim().notEmpty().isEmail(),
	body("firstName").exists().isString().trim().notEmpty(),
	body("lastName").exists().isString().trim().optional({nullable: true}),
	body("protectedKey").exists().isString().trim().notEmpty(),
	body("protectedKeyIV").exists().isString().trim().notEmpty(),
	body("protectedKeyTag").exists().isString().trim().notEmpty(),
	body("publicKey").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKey").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKeyIV").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKeyTag").exists().isString().trim().notEmpty(),
	body("salt").exists().isString().trim().notEmpty(),
	body("verifier").exists().isString().trim().notEmpty(),
	body("organizationName").exists().isString().trim().notEmpty(),
	body("providerAuthToken").isString().trim().optional({ nullable: true }),
	body("attributionSource").optional().isString().trim(),
    validateRequest,
    signupController.completeAccountSignup,
);

export default router;
