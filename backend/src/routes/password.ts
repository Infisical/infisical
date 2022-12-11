import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireAuth, requireSignupAuth, validateRequest } from '../middleware';
import { passwordController } from '../controllers';
import { passwordLimiter } from '../helpers/rateLimiter';

router.post(
	'/srp1',
	requireAuth,
	body('clientPublicKey').exists().trim().notEmpty(),
	validateRequest,
	passwordController.srp1
);

router.post(
	'/change-password',
	passwordLimiter,
	requireAuth,
	body('clientProof').exists().trim().notEmpty(),
	body('encryptedPrivateKey').exists().trim().notEmpty().notEmpty(), // private key encrypted under new pwd
	body('iv').exists().trim().notEmpty(), // new iv for private key
	body('tag').exists().trim().notEmpty(), // new tag for private key
	body('salt').exists().trim().notEmpty(), // part of new pwd
	body('verifier').exists().trim().notEmpty(), // part of new pwd
	validateRequest,
	passwordController.changePassword
);

// NEW
router.post(
	'/email/password-reset',
	passwordLimiter,
	body('email').exists().trim().notEmpty(),
	validateRequest,
	passwordController.emailPasswordReset
);

// NEW
router.post(
	'/email/password-reset-verify',
	passwordLimiter,
	body('email').exists().trim().notEmpty().isEmail(),
	body('code').exists().trim().notEmpty(),
	validateRequest,
	passwordController.emailPasswordResetVerify
);

// NEW
router.get(
	'/backup-private-key',
	passwordLimiter,
	requireSignupAuth,
	passwordController.getBackupPrivateKey
);

router.post(
	'/backup-private-key',
	passwordLimiter,
	requireAuth,
	body('clientProof').exists().trim().notEmpty(),
	body('encryptedPrivateKey').exists().trim().notEmpty(), // (backup) private key encrypted under a strong key
	body('iv').exists().trim().notEmpty(), // new iv for (backup) private key
	body('tag').exists().trim().notEmpty(), // new tag for (backup) private key
	body('salt').exists().trim().notEmpty(), // salt generated from strong key
	body('verifier').exists().trim().notEmpty(), // salt generated from strong key
	validateRequest,
	passwordController.createBackupPrivateKey
);

// NEW
router.post(
	'/password-reset',
	requireSignupAuth,
	body('encryptedPrivateKey').exists().trim().notEmpty(), // private key encrypted under new pwd
	body('iv').exists().trim().notEmpty(), // new iv for private key
	body('tag').exists().trim().notEmpty(), // new tag for private key 
	body('salt').exists().trim().notEmpty(), // part of new pwd
	body('verifier').exists().trim().notEmpty(), // part of new pwd
	validateRequest,
	passwordController.resetPassword
);

export default router;