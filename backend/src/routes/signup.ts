import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireSignupAuth, validateRequest } from '../middleware';
import { signupController } from '../controllers';
import { signupLimiter } from '../helpers/rateLimiter';

router.post(
	'/email/signup',
	signupLimiter,
	body('email').exists().trim().notEmpty().isEmail(),
	validateRequest,
	signupController.beginEmailSignup
);

router.post(
	'/email/verify',
	signupLimiter,
	body('email').exists().trim().notEmpty().isEmail(),
	body('code').exists().trim().notEmpty(),
	validateRequest,
	signupController.verifyEmailSignup
);

router.post(
	'/complete-account/signup',
	signupLimiter,
	requireSignupAuth,
	body('email').exists().trim().notEmpty().isEmail(),
	body('firstName').exists().trim().notEmpty(),
	body('lastName').exists().trim().notEmpty(),
	body('publicKey').exists().trim().notEmpty(),
	body('encryptedPrivateKey').exists().trim().notEmpty(),
	body('iv').exists().trim().notEmpty(),
	body('tag').exists().trim().notEmpty(),
	body('salt').exists().trim().notEmpty(),
	body('verifier').exists().trim().notEmpty(),
	body('organizationName').exists().trim().notEmpty(),
	validateRequest,
	signupController.completeAccountSignup
);

router.post(
	'/complete-account/invite',
	signupLimiter,
	requireSignupAuth,
	body('email').exists().trim().notEmpty().isEmail(),
	body('firstName').exists().trim().notEmpty(),
	body('lastName').exists().trim().notEmpty(),
	body('publicKey').exists().trim().notEmpty(),
	body('encryptedPrivateKey').exists().trim().notEmpty(),
	body('iv').exists().trim().notEmpty(),
	body('tag').exists().trim().notEmpty(),
	body('salt').exists().trim().notEmpty(),
	body('verifier').exists().trim().notEmpty(),
	validateRequest,
	signupController.completeAccountInvite
);

export default router;
