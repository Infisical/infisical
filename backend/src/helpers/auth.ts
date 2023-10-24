import { Request } from "express";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import {
	APIKeyData,
	APIKeyDataV2,
	ITokenVersion,
	IUser,
	ServiceTokenData,
	ServiceTokenDataV3,
	TokenVersion,
	User,
} from "../models";
import {
	APIKeyDataNotFoundError,
	AccountNotFoundError,
	BadRequestError,
	ServiceTokenDataNotFoundError,
	UnauthorizedRequestError,
} from "../utils/errors";
import {
	getAuthSecret,
	getJwtAuthLifetime,
	getJwtRefreshLifetime,
	getJwtServiceTokenSecret
} from "../config";
import {
	AuthMode,
	AuthTokenType
} from "../variables";
import {
	ServiceTokenAuthData,
	ServiceTokenV3AuthData,
	UserAuthData
} from "../interfaces/middleware";

import { ActorType } from "../ee/models";
import { getUserAgentType } from "../utils/posthog";

/**
 * 
 * @param {Object} obj
 * @param {Object} obj.headers - HTTP request headers object
 */
export const validateAuthMode = ({
	headers,
	acceptedAuthModes,
}: {
	headers: { [key: string]: string | string[] | undefined },
	acceptedAuthModes: AuthMode[]
}) => {
	
	const apiKey = headers["x-api-key"];
	const authHeader = headers["authorization"];

	let authMode, authTokenValue;
	if (apiKey === undefined && authHeader === undefined) {
		// case: no auth or X-API-KEY header present
		throw BadRequestError({ message: "Missing Authorization or X-API-KEY in request header." });
	}

	if (typeof apiKey === "string") {
		// case: treat request authentication type as via X-API-KEY (i.e. API Key)
		authMode = AuthMode.API_KEY;
		authTokenValue = apiKey;
	}

	if (typeof authHeader === "string") {
		// case: treat request authentication type as via Authorization header (i.e. either JWT or service token)
		const [tokenType, tokenValue] = <[string, string]>authHeader.split(" ", 2) ?? [null, null]

		if (tokenType === null)
			throw BadRequestError({ message: "Missing Authorization Header in the request header." });
		if (tokenType.toLowerCase() !== "bearer")
			throw BadRequestError({ message: `The provided authentication type '${tokenType}' is not supported.` });
		if (tokenValue === null)
			throw BadRequestError({ message: "Missing Authorization Body in the request header." });

		const parts = tokenValue.split(".");
		
		switch (parts[0]) {
			case "st":
				authMode = AuthMode.SERVICE_TOKEN;
				authTokenValue = tokenValue;
				break;
			case "stv3":
				authMode = AuthMode.SERVICE_TOKEN_V3;
				authTokenValue = parts.slice(1).join(".");
				break;
			default:
				authMode = AuthMode.JWT;
				authTokenValue = tokenValue;
		}
	}

	if (!authMode || !authTokenValue) throw BadRequestError({ message: "Missing valid Authorization or X-API-KEY in request header." });

	if (!acceptedAuthModes.includes(authMode)) throw BadRequestError({ message: "The provided authentication type is not supported." });

	return ({
		authMode,
		authTokenValue,
	});
}

/**
 * Return user payload corresponding to JWT token [authTokenValue]
 * that is either for browser / CLI or API Key
 * @param {Object} obj
 * @param {String} obj.authTokenValue - JWT token value
 * @returns {User} user - user corresponding to JWT token
 */
export const getAuthUserPayload = async ({
	req,
	authTokenValue,
}: {
	req: Request,
	authTokenValue: string;
}): Promise<UserAuthData> => {
	const decodedToken = <jwt.UserIDJwtPayload>(
		jwt.verify(authTokenValue, await getAuthSecret())
	);

	if (
		decodedToken.authTokenType !== AuthTokenType.ACCESS_TOKEN &&
		decodedToken.authTokenType !== AuthTokenType.API_KEY
	) {
		throw UnauthorizedRequestError();
	}
	
	if (decodedToken.authTokenType === AuthTokenType.ACCESS_TOKEN) {
		const tokenVersion = await TokenVersion.findOneAndUpdate({
			_id: new Types.ObjectId(decodedToken.tokenVersionId),
			user: decodedToken.userId
		}, {
			lastUsed: new Date(),
		});
	
		if (!tokenVersion) throw UnauthorizedRequestError();
	
		if (decodedToken.accessVersion !== tokenVersion.accessVersion) throw UnauthorizedRequestError();
	} else if (decodedToken.authTokenType === AuthTokenType.API_KEY) {
		const apiKeyData = await APIKeyDataV2.findOneAndUpdate(
			{
				_id: new Types.ObjectId(decodedToken.apiKeyDataId),
				user: new Types.ObjectId(decodedToken.userId)
			},
			{
				lastUsed: new Date(),
				$inc: { usageCount: 1 }
			},
			{
				new: true
			}
		);
		
		if (!apiKeyData) throw UnauthorizedRequestError();
	}

	const user = await User.findOne({
		_id: new Types.ObjectId(decodedToken.userId),
	}).select("+publicKey +accessVersion");

	if (!user) throw AccountNotFoundError({ message: "Failed to find user" });

	if (!user?.publicKey) throw UnauthorizedRequestError({ message: "Failed to authenticate user with partially set up account" });

	return {
		actor: {
			type: ActorType.USER,
			metadata: {
				userId: user._id.toString(),
				email: user.email
			}
		},
		authPayload: user,
		ipAddress: req.realIP,
		userAgent: req.headers["user-agent"] ?? "",
		userAgentType: getUserAgentType(req.headers["user-agent"])
	}
}

/**
 * Return service token data payload corresponding to service token [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - service token value
 * @returns {ServiceTokenData} serviceTokenData - service token data
 */
export const getAuthSTDPayload = async ({
	req,
	authTokenValue,
}: {
	req: Request,
	authTokenValue: string;
}): Promise<ServiceTokenAuthData> => {
	const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split(".", 3);

	const serviceTokenData = await ServiceTokenData
		.findById(TOKEN_IDENTIFIER, "+secretHash +expiresAt")

	if (!serviceTokenData) {
		throw ServiceTokenDataNotFoundError({ message: "Failed to find service token data" });
	} else if (serviceTokenData?.expiresAt && new Date(serviceTokenData.expiresAt) < new Date()) {
		// case: service token expired
		await ServiceTokenData.findByIdAndDelete(serviceTokenData._id);
		throw UnauthorizedRequestError({
			message: "Failed to authenticate expired service token",
		});
	}

	const isMatch = await bcrypt.compare(TOKEN_SECRET, serviceTokenData.secretHash);
	if (!isMatch) throw UnauthorizedRequestError({
		message: "Failed to authenticate service token",
	});

	const serviceTokenDataToReturn = await ServiceTokenData
		.findOneAndUpdate({
			_id: new Types.ObjectId(TOKEN_IDENTIFIER),
		}, {
			lastUsed: new Date(),
		}, {
			new: true,
		})
		.select("+encryptedKey +iv +tag")

	if (!serviceTokenDataToReturn) throw ServiceTokenDataNotFoundError({ message: "Failed to find service token data" });

	return {
		actor: {
			type: ActorType.SERVICE,
			metadata: {
				serviceId: serviceTokenDataToReturn._id.toString(),
				name: serviceTokenDataToReturn.name
			}
		},
		authPayload: serviceTokenDataToReturn,
		ipAddress: req.realIP,
		userAgent: req.headers["user-agent"] ?? "",
		userAgentType: getUserAgentType(req.headers["user-agent"])
	}
}

/**
 * Return service token data V3 payload corresponding to service token [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - service token value
 * @returns {ServiceTokenData} serviceTokenData - service token data
 */
 export const getAuthSTDV3Payload = async ({
	req,
	authTokenValue,
}: {
	req: Request,
	authTokenValue: string;
}): Promise<ServiceTokenV3AuthData> => {
	const decodedToken = <jwt.UserIDJwtPayload>(
		jwt.verify(authTokenValue, await getJwtServiceTokenSecret())
	);
	
	const serviceTokenData = await ServiceTokenDataV3.findOneAndUpdate(
		{
			_id: new Types.ObjectId(decodedToken._id),
			isActive: true
		},
		{
			lastUsed: new Date(),
			$inc: { usageCount: 1 }
		},
		{
			new: true
		}
	);
	
	if (!serviceTokenData) {
		throw UnauthorizedRequestError({ 
			message: "Failed to authenticate"
		});
	} else if (serviceTokenData?.expiresAt && new Date(serviceTokenData.expiresAt) < new Date()) {
		// case: service token expired
		await ServiceTokenDataV3.findByIdAndUpdate(
			serviceTokenData._id,
			{
				isActive: false
			},
			{
				new: true
			}
		);
		
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	}

	return {
		actor: {
			type: ActorType.SERVICE_V3,
			metadata: {
				serviceId: serviceTokenData._id.toString(),
				name: serviceTokenData.name
			}
		},
		authPayload: serviceTokenData,
		ipAddress: req.realIP,
		userAgent: req.headers["user-agent"] ?? "",
		userAgentType: getUserAgentType(req.headers["user-agent"])
	}
}

/**
 * Return API key data payload corresponding to API key [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - API key value
 * @returns {APIKeyData} apiKeyData - API key data
 */
export const getAuthAPIKeyPayload = async ({
	req,
	authTokenValue,
}: {
	req: Request,
	authTokenValue: string;
}): Promise<UserAuthData> => {
	const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split(".", 3);

	let apiKeyData = await APIKeyData
		.findById(TOKEN_IDENTIFIER, "+secretHash +expiresAt")
		.populate<{ user: IUser }>("user", "+publicKey");

	if (!apiKeyData) {
		throw APIKeyDataNotFoundError({ message: "Failed to find API key data" });
	} else if (apiKeyData?.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
		// case: API key expired
		await APIKeyData.findByIdAndDelete(apiKeyData._id);
		throw UnauthorizedRequestError({
			message: "Failed to authenticate expired API key",
		});
	}

	const isMatch = await bcrypt.compare(TOKEN_SECRET, apiKeyData.secretHash);
	if (!isMatch) throw UnauthorizedRequestError({
		message: "Failed to authenticate API key",
	});

	apiKeyData = await APIKeyData.findOneAndUpdate({
		_id: new Types.ObjectId(TOKEN_IDENTIFIER),
	}, {
		lastUsed: new Date(),
	}, {
		new: true,
	});

	if (!apiKeyData) {
		throw APIKeyDataNotFoundError({ message: "Failed to find API key data" });
	}

	const user = await User.findById(apiKeyData.user).select("+publicKey");

	if (!user) {
		throw AccountNotFoundError({
			message: "Failed to find user",
		});
	}

	return {
		actor: {
			type: ActorType.USER,
			metadata: {
				userId: user._id.toString(),
				email: user.email
			}
		},
		authPayload: user,
		ipAddress: req.realIP,
		userAgent: req.headers["user-agent"] ?? "",
		userAgentType: getUserAgentType(req.headers["user-agent"])
	}
}

/**
 * Return newly issued (JWT) auth and refresh tokens to user with id [userId]
 * @param {Object} obj
 * @param {String} obj.userId - id of user who we are issuing tokens for
 * @return {Object} obj
 * @return {String} obj.token - issued JWT token
 * @return {String} obj.refreshToken - issued refresh token
 */
export const issueAuthTokens = async ({
	userId,
	ip,
	userAgent,
}: {
	userId: Types.ObjectId;
	ip: string;
	userAgent: string;
}) => {
	let tokenVersion: ITokenVersion | null;

	// continue with (session) token version matching existing ip and user agent
	tokenVersion = await TokenVersion.findOne({
		user: userId,
		ip,
		userAgent,
	});

	if (!tokenVersion) {
		// case: no existing ip and user agent exists
		// -> create new (session) token version for ip and user agent
		tokenVersion = await new TokenVersion({
			user: userId,
			refreshVersion: 0,
			accessVersion: 0,
			ip,
			userAgent,
			lastUsed: new Date(),
		}).save();
	}

	// issue tokens
	const token = createToken({
		payload: {
			authTokenType: AuthTokenType.ACCESS_TOKEN,
			userId,
			tokenVersionId: tokenVersion._id.toString(),
			accessVersion: tokenVersion.accessVersion,
		},
		expiresIn: await getJwtAuthLifetime(),
		secret: await getAuthSecret(),
	});

	const refreshToken = createToken({
		payload: {
			authTokenType: AuthTokenType.REFRESH_TOKEN,
			userId,
			tokenVersionId: tokenVersion._id.toString(),
			refreshVersion: tokenVersion.refreshVersion,
		},
		expiresIn: await getJwtRefreshLifetime(),
		secret: await getAuthSecret(),
	});

	return {
		token,
		refreshToken,
	};
};

/**
 * Remove JWT and refresh tokens for user with id [userId]
 * @param {Object} obj
 * @param {String} obj.userId - id of user whose tokens are cleared.
 */
export const clearTokens = async (tokenVersionId: Types.ObjectId): Promise<void> => {
	// increment refreshVersion on user by 1

	await TokenVersion.findOneAndUpdate({
		_id: tokenVersionId,
	}, {
		$inc: {
			refreshVersion: 1,
			accessVersion: 1,
		},
	});
};

/**
 * Return a new (JWT) token for user with id [userId] that expires in [expiresIn]; can be used to, for instance, generate
 * bearer/auth, refresh, and temporary signup tokens
 * @param {Object} obj
 * @param {Object} obj.payload - payload of (JWT) token
 * @param {String} obj.secret - (JWT) secret such as [AUTH_SECRET]
 * @param {String} obj.expiresIn - string describing time span such as '10h' or '7d'
 */
export const createToken = ({
	payload,
	expiresIn,
	secret,
}: {
	payload: any;
	expiresIn?: string | number;
	secret: string;
}) => {
	return jwt.sign(payload, secret, {
		...(
			(expiresIn !== undefined && expiresIn !== null) 
			? { expiresIn } 
			: {}
		)
	});
};

export const validateProviderAuthToken = async ({
	email,
	providerAuthToken,
}: {
	email: string;
	providerAuthToken?: string;
}) => {

	if (!providerAuthToken) {
		throw new Error("Invalid authentication request.");
	}

	const decodedToken = <jwt.ProviderAuthJwtPayload>(
		jwt.verify(providerAuthToken, await getAuthSecret())
	);
	
	if (decodedToken.authTokenType !== AuthTokenType.PROVIDER_TOKEN) throw UnauthorizedRequestError();

	if (decodedToken.email !== email) {
		throw new Error("Invalid authentication credentials.")
	}
}
