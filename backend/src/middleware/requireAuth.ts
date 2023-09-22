import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import {
	getAuthAPIKeyPayload,
	getAuthSTDPayload,
	getAuthSTDV3Payload,
	getAuthUserPayload,
	validateAuthMode,
} from "../helpers/auth";
import { AuthMode } from "../variables";
import { AuthData } from "../interfaces/middleware";

declare module "jsonwebtoken" {
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
	acceptedAuthModes = [AuthMode.JWT],
}: {
	acceptedAuthModes: AuthMode[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {

		// validate auth token against accepted auth modes [acceptedAuthModes]
		// and return token type [authTokenType] and value [authTokenValue]
		const { authMode, authTokenValue } = validateAuthMode({
			headers: req.headers,
			acceptedAuthModes,
		});
		
		let authData: AuthData;
		
		switch (authMode) {
			case AuthMode.SERVICE_TOKEN:
				authData = await getAuthSTDPayload({
					req,
					authTokenValue,
				});
				req.serviceTokenData = authData.authPayload;
				break;
			case AuthMode.SERVICE_TOKEN_V3:
				authData = await getAuthSTDV3Payload({
					req,
					authTokenValue
				});
				break;
			case AuthMode.API_KEY:
				authData = await getAuthAPIKeyPayload({
					req,
					authTokenValue
				});
				req.user = authData.authPayload;
				break;
			case AuthMode.JWT:
				authData = await getAuthUserPayload({
					req,
					authTokenValue
				});
				req.user = authData.authPayload;
				break;
		}
		
		req.authData = authData;

		return next();
	}
}

export default requireAuth;
