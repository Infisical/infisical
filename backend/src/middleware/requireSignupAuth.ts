import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { User } from '../models';
import { JWT_SIGNUP_SECRET } from '../config';
import { BadRequestError, UnauthorizedRequestError } from '../utils/errors';

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

	const [ AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE ] = <[string, string]>req.headers['authorization']?.split(' ', 2) ?? [null, null]
	if(AUTH_TOKEN_TYPE === null) return next(BadRequestError({message: `Missing Authorization Header in the request header.`}))
	if(AUTH_TOKEN_TYPE.toLowerCase() !== 'bearer') return next(UnauthorizedRequestError({message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`}))
	if(AUTH_TOKEN_VALUE === null) return next(BadRequestError({message: 'Missing Authorization Body in the request header'}))
	
	const decodedToken = <jwt.UserIDJwtPayload>(
		jwt.verify(AUTH_TOKEN_VALUE, JWT_SIGNUP_SECRET)
	);

	const user = await User.findOne({
		_id: decodedToken.userId
	}).select('+publicKey');

	if (!user)
		return next(UnauthorizedRequestError({message: 'Unable to authenticate for User account completion. Try logging in again'}))

	req.user = user;
	return next();
};

export default requireSignupAuth;
