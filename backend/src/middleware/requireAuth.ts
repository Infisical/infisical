import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import {
	validateAuthMode,
	getAuthUserPayload,
	getAuthSTDPayload,
	getAuthAPIKeyPayload
} from '../helpers/auth';
import { 
	UnauthorizedRequestError
} from '../utils/errors';

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
const requireAuth = ({
	acceptedAuthModes = ['jwt'],
	requiredServiceTokenPermissions = []
}: {
	acceptedAuthModes: string[];
	requiredServiceTokenPermissions?: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// validate auth token against accepted auth modes [acceptedAuthModes]
		// and return token type [authTokenType] and value [authTokenValue]
		const { authTokenType, authTokenValue } = validateAuthMode({
			headers: req.headers,
			acceptedAuthModes
		});

		// attach auth payloads
		let serviceTokenData;
		switch (authTokenType) {
			case 'serviceToken':
				serviceTokenData = await getAuthSTDPayload({
					authTokenValue
				});
				
				requiredServiceTokenPermissions.forEach((requiredServiceTokenPermission) => {
					if (!serviceTokenData.permissions.includes(requiredServiceTokenPermission)) {
						return next(UnauthorizedRequestError({ message: 'Failed to authorize service token for endpoint' }));
					}
				});
			
				req.serviceTokenData = serviceTokenData;
				req.user = serviceTokenData?.user;
				
				break;
			case 'apiKey':
				req.user = await getAuthAPIKeyPayload({
					authTokenValue
				});
				break;
			default:
				req.user = await getAuthUserPayload({
					authTokenValue
				});
				break;
		}

		return next();
	}
}

export default requireAuth;
