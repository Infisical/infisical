import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { ServiceToken } from '../models';
import { JWT_SERVICE_SECRET } from '../config';

declare module 'jsonwebtoken' {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if JWT (service) token on request is valid (e.g. not expired),
 * and if there is an associated service token
 * @param req - express request object
 * @param res - express response object
 * @param next - express next function
 * @returns
 */
const requireServiceTokenAuth = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	// JWT service token middleware
	try {
		if (!req.headers?.authorization)
			throw new Error('Failed to locate authorization header');

		const token = req.headers.authorization.split(' ')[1];

		const decodedToken = <jwt.UserIDJwtPayload>(
			jwt.verify(token, JWT_SERVICE_SECRET)
		);

		const serviceToken = await ServiceToken.findOne({
			_id: decodedToken.serviceTokenId
		})
			.populate('user', '+publicKey')
			.select('+encryptedKey +publicKey +nonce');

		if (!serviceToken) throw new Error('Failed to find service token');

		req.serviceToken = serviceToken;
		return next();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(401).send({
			error: 'Failed to authenticate service token'
		});
	}
};

export default requireServiceTokenAuth;
