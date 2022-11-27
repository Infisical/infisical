import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireAuth, validateRequest } from '../middleware';
import { authController } from '../controllers';
import { loginLimiter } from '../helpers/rateLimiter';

router.post(
	'/token',
	validateRequest,
	authController.getNewToken
);

/**
 * @swagger
 * /auth/login1:
 *   post:
 *     summary: Return server's public key and user's salt for login via SRP.
 *     description: As part of the 1st step of secure remote password (SRP), return server's public key and user's salt.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email of user
 *                 example: 'johndoe@gmail.com'
 *               clientPublicKey:
 *                 type: string
 *                 description: Client-side SRP-generated public key
 *                 example: 'b13dc83cb...'
 *     responses:
 *       200:
 *         description: Object containing the server's public key and user's salt.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 serverPublicKey:
 *                   type: string
 *                   description: Server-side SRP-generated public key
 *                   example: 'b13dc83cb...'
 *                 salt:
 *                   type: string
 *                   description: User's salt
 *                   example: 'dc1ac694f...'
 *       400:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Failed to start authentication process'
 */
router.post(
	'/login1',
	loginLimiter,
	body('email').exists().trim().notEmpty(),
	body('clientPublicKey').exists().trim().notEmpty(),
	validateRequest,
	authController.login1
);

router.post(
	'/login2',
	loginLimiter,
	body('email').exists().trim().notEmpty(),
	body('clientProof').exists().trim().notEmpty(),
	validateRequest,
	authController.login2
);

router.post('/logout', requireAuth, authController.logout);
router.post('/checkAuth', requireAuth, authController.checkAuth);

export default router;
