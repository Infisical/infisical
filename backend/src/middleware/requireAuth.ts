import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User, ServiceTokenData } from '../models';
import {
	validateAuthMode,
	getAuthUserPayload,
	getAuthSTDPayload
} from '../helpers/auth';
import { JWT_AUTH_SECRET } from '../config';
import { AccountNotFoundError, BadRequestError, UnauthorizedRequestError } from '../utils/errors';

declare module 'jsonwebtoken' {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if token on request is valid (e.g. not expired) for various auth modes:
 * - If token is a JWT token, then check if there is an associated user
 * and if user is fully setup.
 * - If token is a service token (st), then check if there is associated
 * service token data.
 * @param {Object} obj
 * @param {String[]} obj.acceptedAuthModes - accepted modes of authentication (jwt/st)
 * @returns
 */
const requireAuth  = ({
	acceptedAuthModes = ['jwt']
}: {
	acceptedAuthModes: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const [ AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE ] = <[string, string]>req.headers['authorization']?.split(' ', 2) ?? [null, null]
		if(AUTH_TOKEN_TYPE === null) 
			return next(BadRequestError({message: `Missing Authorization Header in the request header.`}))
		if(AUTH_TOKEN_TYPE.toLowerCase() !== 'bearer') 
			return next(BadRequestError({message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`}))
		if(AUTH_TOKEN_VALUE === null) 
			return next(BadRequestError({message: 'Missing Authorization Body in the request header'}))
		
		// validate auth token against 
		const authMode = validateAuthMode({
			authTokenValue: AUTH_TOKEN_VALUE,
			acceptedAuthModes
		});
		
		if (!acceptedAuthModes.includes(authMode)) throw new Error('Failed to validate auth mode');
		
		// attach auth payloads
		switch (authMode) {
			case 'serviceToken':
				req.serviceTokenData = await getAuthSTDPayload({
					authTokenValue: AUTH_TOKEN_VALUE
				});
				break;
			default:
				req.user = await getAuthUserPayload({
					authTokenValue: AUTH_TOKEN_VALUE
				});
				break;
		}

		return next();
	}
}

export default requireAuth;
