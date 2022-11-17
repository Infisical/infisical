import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { User } from '../models';
import { JWT_SIGNUP_SECRET } from '../config';

declare module 'jsonwebtoken' {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if JWT temporary token on request is valid (e.g. not expired)
 * and if there is an associated user.
 */
const requireSignupAuth = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	// JWT (temporary) authentication middleware for complete signup

	try {
		if (!req.headers?.authorization)
			throw new Error('Failed to locate authorization header');

		const token = req.headers.authorization.split(' ')[1];
		const decodedToken = <jwt.UserIDJwtPayload>(
			jwt.verify(token, JWT_SIGNUP_SECRET)
		);

		const user = await User.findOne({
			_id: decodedToken.userId
		}).select('+publicKey');

		if (!user)
			throw new Error('Failed to temporarily authenticate unfound user');

		req.user = user;
		return next();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(401).send({
			error:
				'Failed to temporarily authenticate user for complete account. Try logging in'
		});
	}
};

export default requireSignupAuth;
