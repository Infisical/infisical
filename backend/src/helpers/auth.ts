import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcrypt';
import {
	User,
	ServiceTokenData
} from '../models';
import {
	JWT_AUTH_LIFETIME,
	JWT_AUTH_SECRET,
	JWT_REFRESH_LIFETIME,
	JWT_REFRESH_SECRET,
	SALT_ROUNDS
} from '../config';

/**
 * Attach auth payload
 * @param {Object} obj
 * @param {String} obj.authTokenValue
 */
const attachAuthPayload = async ({
	authTokenValue
}: {
	authTokenValue: string;
}) => {
	let serviceTokenHash, decodedToken; // intermediate variables
	let serviceTokenData, user; // payloads
	try {
		switch (authTokenValue.split('.', 1)[0]) {
			case 'st':
				// case: service token auth mode
				serviceTokenHash = await bcrypt.hash(authTokenValue, SALT_ROUNDS);
				serviceTokenData = await ServiceTokenData
					.findOne({
						serviceTokenHash
					})
					.select('+encryptedKey +iv +tag');
				
				if (!serviceTokenData) {
					throw new Error('Account not found error');
				}

				return serviceTokenData;
			default:
				//  case: JWT token auth mode
				decodedToken = <jwt.UserIDJwtPayload>(
					jwt.verify(authTokenValue, JWT_AUTH_SECRET)
				);
				
				user = await User.findOne({
					_id: decodedToken.userId
				}).select('+publicKey');

				if (!user) 
					throw new Error('Account not found error');

				if (!user?.publicKey)
					throw new Error('Unable to authenticate due to partially set up account');

				return user;
		}
	} catch (err) {
		throw new Error('Failed to attach auth payload');
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
	attachAuthPayload,
	createToken, 
	issueTokens, 
	clearTokens 
};
