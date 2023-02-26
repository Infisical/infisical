import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireSignupAuth, validateRequest } from '../../middleware';
import { signupController } from '../../controllers/v2';
import { authLimiter } from '../../helpers/rateLimiter';

router.post(
    '/complete-account/signup',
    authLimiter,
    requireSignupAuth,
    body('email').exists().isString().trim().notEmpty().isEmail(),
	body('firstName').exists().isString().trim().notEmpty(),
	body('lastName').exists().isString().trim().notEmpty(),
	body('protectedKey').exists().isString().trim().notEmpty(),
	body('protectedKeyIV').exists().isString().trim().notEmpty(),
	body('protectedKeyTag').exists().isString().trim().notEmpty(),
	body('publicKey').exists().isString().trim().notEmpty(),
	body('encryptedPrivateKey').exists().isString().trim().notEmpty(),
	body('encryptedPrivateKeyIV').exists().isString().trim().notEmpty(),
	body('encryptedPrivateKeyTag').exists().isString().trim().notEmpty(),
	body('salt').exists().isString().trim().notEmpty(),
	body('verifier').exists().isString().trim().notEmpty(),
	body('organizationName').exists().isString().trim().notEmpty(),
    validateRequest,
    signupController.completeAccountSignup
);

router.post(
	'/complete-account/invite',
	authLimiter,
	requireSignupAuth,
	body('email').exists().isString().trim().notEmpty().isEmail(),
	body('firstName').exists().isString().trim().notEmpty(),
	body('lastName').exists().isString().trim().notEmpty(),
	body('protectedKey').exists().isString().trim().notEmpty(),
	body('protectedKeyIV').exists().isString().trim().notEmpty(),
	body('protectedKeyTag').exists().isString().trim().notEmpty(),
	body('publicKey').exists().trim().notEmpty(),
	body('encryptedPrivateKey').exists().isString().trim().notEmpty(),
	body('encryptedPrivateKeyIV').exists().isString().trim().notEmpty(),
	body('encryptedPrivateKeyTag').exists().isString().trim().notEmpty(),
	body('salt').exists().isString().trim().notEmpty(),
	body('verifier').exists().isString().trim().notEmpty(),
	validateRequest,
	signupController.completeAccountInvite
);

export default router;