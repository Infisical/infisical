import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { AuthMode } from "../variables";
import { AuthData } from "../interfaces/middleware";
import { extractAuthMode, getAuthData } from "../utils/authn/helpers";
import { UnauthorizedRequestError } from "../utils/errors";

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
		
		// extract auth mode
		const { authMode, authTokenValue } = await extractAuthMode({
			headers: req.headers
		});

		// validate auth mode
		if (!acceptedAuthModes.includes(authMode)) throw UnauthorizedRequestError({
			message: "Failed to authenticate unaccepted authentication mode"
		});
		
		// get auth data / payload
		const authData: AuthData = await getAuthData({
			authMode,
			authTokenValue,
			ipAddress: req.realIP,
			userAgent: req.headers["user-agent"] ?? ""
		});
		
		switch (authMode) {
			case AuthMode.SERVICE_TOKEN:
				req.serviceTokenData = authData.authPayload;
				break;
			case AuthMode.SERVICE_ACCESS_TOKEN:
				req.serviceTokenData = authData.authPayload;
				break;
			case AuthMode.API_KEY:
				req.user = authData.authPayload;
				break;
			case AuthMode.API_KEY_V2:
				req.user = authData.authPayload;
				break;
			case AuthMode.JWT:
				req.user = authData.authPayload;
				break;
		}
		
		req.authData = authData;

		return next();
	}
}

export default requireAuth;
