import express from "express";
const router = express.Router();
import { body } from "express-validator";
import { requireAuth, requireSignupAuth, validateRequest } from "../../middleware";
import { passwordController } from "../../controllers/v1";
import { passwordLimiter } from "../../helpers/rateLimiter";
import { AuthMode } from "../../variables";

router.post(
	"/srp1",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("clientPublicKey").exists().isString().trim().notEmpty(),
	validateRequest,
	passwordController.srp1
);

router.post(
	"/change-password",
	passwordLimiter,
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("clientProof").exists().trim().notEmpty(),
	body("protectedKey").exists().isString().trim().notEmpty(),
	body("protectedKeyIV").exists().isString().trim().notEmpty(),
	body("protectedKeyTag").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKey").exists().isString().trim().notEmpty(), // private key encrypted under new pwd
	body("encryptedPrivateKeyIV").exists().isString().trim().notEmpty(), // new iv for private key
	body("encryptedPrivateKeyTag").exists().isString().trim().notEmpty(), // new tag for private key
	body("salt").exists().isString().trim().notEmpty(), // part of new pwd
	body("verifier").exists().isString().trim().notEmpty(), // part of new pwd
	validateRequest,
	passwordController.changePassword
);

router.post(
	"/email/password-reset",
	passwordLimiter,
	body("email").exists().isString().trim().notEmpty().isEmail(),
	validateRequest,
	passwordController.emailPasswordReset
);

router.post(
	"/email/password-reset-verify",
	passwordLimiter,
	body("email").exists().isString().trim().notEmpty().isEmail(),
	body("code").exists().isString().trim().notEmpty(),
	validateRequest,
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
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("clientProof").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKey").exists().isString().trim().notEmpty(), // (backup) private key encrypted under a strong key
	body("iv").exists().isString().trim().notEmpty(), // new iv for (backup) private key
	body("tag").exists().isString().trim().notEmpty(), // new tag for (backup) private key
	body("salt").exists().isString().trim().notEmpty(), // salt generated from strong key
	body("verifier").exists().isString().trim().notEmpty(), // salt generated from strong key
	validateRequest,
	passwordController.createBackupPrivateKey
);

router.post(
	"/password-reset",
	requireSignupAuth,
	body("protectedKey").exists().isString().trim().notEmpty(),
	body("protectedKeyIV").exists().isString().trim().notEmpty(),
	body("protectedKeyTag").exists().isString().trim().notEmpty(),
	body("encryptedPrivateKey").exists().isString().trim().notEmpty(), // private key encrypted under new pwd
	body("encryptedPrivateKeyIV").exists().isString().trim().notEmpty(), // new iv for private key
	body("encryptedPrivateKeyTag").exists().isString().trim().notEmpty(), // new tag for private key 
	body("salt").exists().isString().trim().notEmpty(), // part of new pwd
	body("verifier").exists().isString().trim().notEmpty(), // part of new pwd
	validateRequest,
	passwordController.resetPassword
);

export default router;