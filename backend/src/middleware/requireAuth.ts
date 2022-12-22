import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { JWT_AUTH_SECRET } from '../config';
import { BadRequestError, UnauthorizedRequestError } from '../utils/errors';

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
	const [ AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE ] = <[string, string]>req.headers['authorization']?.split(' ', 2) ?? [null, null]
	if(AUTH_TOKEN_TYPE === null) return next(BadRequestError({message: `Missing Authorization Header in the request header.`}))
	if(AUTH_TOKEN_TYPE.toLowerCase() !== 'bearer') return next(UnauthorizedRequestError({message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`}))
	if(AUTH_TOKEN_VALUE === null) return next(BadRequestError({message: 'Missing Authorization Body in the request header'}))

	const decodedToken = <jwt.UserIDJwtPayload>(
		jwt.verify(AUTH_TOKEN_VALUE, JWT_AUTH_SECRET)
	);

	const user = await User.findOne({
		_id: decodedToken.userId
	}).select('+publicKey');

	if (!user) return next(UnauthorizedRequestError({message: 'Failed to locate User account'}))
	if (!user?.publicKey)
		return next(UnauthorizedRequestError({message: 'Unable to authenticate due to partially set up account'}))

	req.user = user;
	return next();
};

export default requireAuth;
