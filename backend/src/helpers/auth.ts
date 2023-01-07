import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcrypt';
import {
	User,
	ServiceTokenData,
	APIKeyData
} from '../models';
import {
	JWT_AUTH_LIFETIME,
	JWT_AUTH_SECRET,
	JWT_REFRESH_LIFETIME,
	JWT_REFRESH_SECRET
} from '../config';
import {
	AccountNotFoundError,
	ServiceTokenDataNotFoundError,
	APIKeyDataNotFoundError,
	UnauthorizedRequestError
} from '../utils/errors';

// TODO 1: check if API key works
// TODO 2: optimize middleware

/**
 * Validate that auth token value [authTokenValue] falls under one of
 * accepted auth modes [acceptedAuthModes].
 * @param {Object} obj
 * @param {String} obj.authTokenValue - auth token value (e.g. JWT or service token value)
 * @param {String[]} obj.acceptedAuthModes - accepted auth modes (e.g. jwt, serviceToken)
 * @returns {String} authMode - auth mode
 */
const validateAuthMode = ({
	authTokenValue,
	acceptedAuthModes
}: {
	authTokenValue: string;
	acceptedAuthModes: string[];
}) => {
	let authMode;
	try {
		switch (authTokenValue.split('.', 1)[0]) {
			case 'st':
				authMode = 'serviceToken';
				break;
			case 'ak':
				authMode = 'apiKey';
				break;
			default:
				authMode = 'jwt';
				break;
		}
		
		if (!acceptedAuthModes.includes(authMode)) 
			throw UnauthorizedRequestError({ message: 'Failed to authenticated auth mode' });

	} catch (err) {
		throw UnauthorizedRequestError({ message: 'Failed to authenticated auth mode' });
	}
	
	return authMode;
}

/**
 * Return user payload corresponding to JWT token [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - JWT token value
 * @returns {User} user - user corresponding to JWT token
 */
const getAuthUserPayload = async ({
	authTokenValue
}: {
	authTokenValue: string;
}) => {
	let user;
	try {
		const decodedToken = <jwt.UserIDJwtPayload>(
			jwt.verify(authTokenValue, JWT_AUTH_SECRET)
		);

		user = await User.findOne({
			_id: decodedToken.userId
		}).select('+publicKey');

		if (!user) throw AccountNotFoundError({ message: 'Failed to find User' });

		if (!user?.publicKey) throw UnauthorizedRequestError({ message: 'Failed to authenticate User with partially set up account' });

	} catch (err) {
		throw UnauthorizedRequestError({
			message: 'Failed to authenticate JWT token'
		});
	}
	
	return user;
}

/**
 * Return service token data payload corresponding to service token [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - service token value
 * @returns {ServiceTokenData} serviceTokenData - service token data
 */
const getAuthSTDPayload = async ({
	authTokenValue
}: {
	authTokenValue: string;
}) => {
	let serviceTokenData;
	try {
		const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split('.', 3);

		// TODO: optimize double query
		serviceTokenData = await ServiceTokenData
			.findById(TOKEN_IDENTIFIER, '+secretHash +expiresAt');
		
		if (!serviceTokenData) {
			throw ServiceTokenDataNotFoundError({ message: 'Failed to find service token data' });
		} else if (serviceTokenData?.expiresAt && new Date(serviceTokenData.expiresAt) < new Date()) {
			// case: service token expired
			await ServiceTokenData.findByIdAndDelete(serviceTokenData._id);
			throw UnauthorizedRequestError({
				message: 'Failed to authenticate expired service token'
			});
		}

		const isMatch = await bcrypt.compare(TOKEN_SECRET, serviceTokenData.secretHash);
		if (!isMatch) throw UnauthorizedRequestError({
			message: 'Failed to authenticate service token'
		});

		serviceTokenData = await ServiceTokenData
			.findById(TOKEN_IDENTIFIER)
			.select('+encryptedKey +iv +tag');

	} catch (err) {
		throw UnauthorizedRequestError({
			message: 'Failed to authenticate service token'
		});
	}
	
	return serviceTokenData;
}

/**
 * Return API key data payload corresponding to API key [authTokenValue]
 * @param {Object} obj
 * @param {String} obj.authTokenValue - API key value
 * @returns {APIKeyData} apiKeyData - API key data
 */
const getAuthAPIKeyPayload = async ({
	authTokenValue
}: {
	authTokenValue: string;
}) => {
	let user;
	try {
		const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split('.', 3);
		
		const apiKeyData = await APIKeyData
			.findById(TOKEN_IDENTIFIER, '+secretHash +expiresAt')
			.populate('user', '+publicKey');
		
		if (!apiKeyData) {
			throw APIKeyDataNotFoundError({ message: 'Failed to find API key data' });
		} else if (apiKeyData?.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
			// case: API key expired
			await APIKeyData.findByIdAndDelete(apiKeyData._id);
			throw UnauthorizedRequestError({
				message: 'Failed to authenticate expired API key'
			});
		}

		const isMatch = await bcrypt.compare(TOKEN_SECRET, apiKeyData.secretHash);
		if (!isMatch) throw UnauthorizedRequestError({
			message: 'Failed to authenticate API key'
		});
		
		user = apiKeyData.user;
	} catch (err) {
		throw UnauthorizedRequestError({
			message: 'Failed to authenticate API key'
		});
	}
	
	return user;
}

/**
 * Return newly issued (JWT) auth and refresh tokens to user with id [userId]
 * @param {Object} obj
 * @param {String} obj.userId - id of user who we are issuing tokens for
 * @return {Object} obj
 * @return {String} obj.token - issued JWT token
 * @return {String} obj.refreshToken - issued refresh token
 */
const issueTokens = async ({ userId }: { userId: string }) => {
	let token: string;
	let refreshToken: string;
	try {
		// issue tokens
		token = createToken({
			payload: {
				userId
			},
			expiresIn: JWT_AUTH_LIFETIME,
			secret: JWT_AUTH_SECRET
		});

		refreshToken = createToken({
			payload: {
				userId
			},
			expiresIn: JWT_REFRESH_LIFETIME,
			secret: JWT_REFRESH_SECRET
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to issue tokens');
	}

	return {
		token,
		refreshToken
	};
};

/**
 * Remove JWT and refresh tokens for user with id [userId]
 * @param {Object} obj
 * @param {String} obj.userId - id of user whose tokens are cleared.
 */
const clearTokens = async ({ userId }: { userId: string }): Promise<void> => {
	try {
		// increment refreshVersion on user by 1
		User.findOneAndUpdate({
			_id: userId
		}, {
			$inc: {
				refreshVersion: 1
			}
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
	}
};

/**
 * Return a new (JWT) token for user with id [userId] that expires in [expiresIn]; can be used to, for instance, generate
 * bearer/auth, refresh, and temporary signup tokens
 * @param {Object} obj
 * @param {Object} obj.payload - payload of (JWT) token
 * @param {String} obj.secret - (JWT) secret such as [JWT_AUTH_SECRET]
 * @param {String} obj.expiresIn - string describing time span such as '10h' or '7d'
 */
const createToken = ({
	payload,
	expiresIn,
	secret
}: {
	payload: any;
	expiresIn: string | number;
	secret: string;
}) => {
	try {
		return jwt.sign(payload, secret, {
			expiresIn
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to create a token');
	}
};

export { 
	validateAuthMode,
	getAuthUserPayload,
	getAuthSTDPayload,
	getAuthAPIKeyPayload,
	createToken, 
	issueTokens, 
	clearTokens 
};
