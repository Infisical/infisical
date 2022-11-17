import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { User } from '../models';
import { JWT_AUTH_SECRET } from '../config';

declare module 'jsonwebtoken' {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if JWT (auth) token on request is valid (e.g. not expired),
 * if there is an associated user, and if that user is fully setup.
 * @param req - express request object
 * @param res - express response object
 * @param next - express next function
 * @returns
 */
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
	// JWT authentication middleware
	try {
		if (!req.headers?.authorization)
			throw new Error('Failed to locate authorization header');

		const token = req.headers.authorization.split(' ')[1];
		const decodedToken = <jwt.UserIDJwtPayload>(
			jwt.verify(token, JWT_AUTH_SECRET)
		);

		const user = await User.findOne({
			_id: decodedToken.userId
		}).select('+publicKey');

		if (!user) throw new Error('Failed to authenticate unfound user');
		if (!user?.publicKey)
			throw new Error('Failed to authenticate not fully set up account');

		req.user = user;
		return next();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(401).send({
			error: 'Failed to authenticate user. Try logging in'
		});
	}
};

export default requireAuth;
