import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { ITokenVersion, TokenVersion } from "../models";
import { UnauthorizedRequestError } from "../utils/errors";
import {
	getAuthSecret,
	getJwtAuthLifetime,
	getJwtRefreshLifetime
} from "../config";
import { AuthTokenType } from "../variables";

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
