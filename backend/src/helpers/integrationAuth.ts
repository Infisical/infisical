import * as Sentry from '@sentry/node';
import axios from 'axios';
import { IntegrationAuth } from '../models';
import { encryptSymmetric, decryptSymmetric } from '../utils/crypto';
import { IIntegrationAuth } from '../models';
import {
	ENCRYPTION_KEY,
	OAUTH_CLIENT_SECRET_HEROKU,
	OAUTH_TOKEN_URL_HEROKU
} from '../config';

/**
 * Process token exchange and refresh responses from respective OAuth2 authorization servers by
 * encrypting access and refresh tokens, computing new access token expiration times [accessExpiresAt],
 * and upserting them into the DB for workspace with id [workspaceId] and integration [integration].
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.integration - name of integration (e.g. heroku)
 * @param {Object} obj.res - response from OAuth2 authorization server
 */
const processOAuthTokenRes = async ({
	workspaceId,
	integration,
	res
}: {
	workspaceId: string;
	integration: string;
	res: any;
}): Promise<IIntegrationAuth> => {
	let integrationAuth;
	try {
		// encrypt refresh + access tokens
		const {
			ciphertext: refreshCiphertext,
			iv: refreshIV,
			tag: refreshTag
		} = encryptSymmetric({
			plaintext: res.data.refresh_token,
			key: ENCRYPTION_KEY
		});

		const {
			ciphertext: accessCiphertext,
			iv: accessIV,
			tag: accessTag
		} = encryptSymmetric({
			plaintext: res.data.access_token,
			key: ENCRYPTION_KEY
		});

		// compute access token expiration date
		const accessExpiresAt = new Date();
		accessExpiresAt.setSeconds(
			accessExpiresAt.getSeconds() + res.data.expires_in
		);

		// create or replace integration authorization with encrypted tokens
		// and access token expiration date
		integrationAuth = await IntegrationAuth.findOneAndUpdate(
			{ workspace: workspaceId, integration },
			{
				workspace: workspaceId,
				integration,
				refreshCiphertext,
				refreshIV,
				refreshTag,
				accessCiphertext,
				accessIV,
				accessTag,
				accessExpiresAt
			},
			{ upsert: true, new: true }
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error(
			'Failed to process OAuth2 authorization server token response'
		);
	}

	return integrationAuth;
};

/**
 * Return access token for integration either by decrypting a non-expired access token [accessCiphertext] on
 * the integration authorization document or by requesting a new one by decrypting and exchanging the
 * refresh token [refreshCiphertext] with the respective OAuth2 authorization server.
 * @param {Object} obj
 * @param {IIntegrationAuth} obj.integrationAuth - an integration authorization document
 * @returns {String} access token - new access token
 */
const getOAuthAccessToken = async ({
	integrationAuth
}: {
	integrationAuth: IIntegrationAuth;
}) => {
	let accessToken;
	try {
		const {
			refreshCiphertext,
			refreshIV,
			refreshTag,
			accessCiphertext,
			accessIV,
			accessTag,
			accessExpiresAt
		} = integrationAuth;

		if (
			refreshCiphertext &&
			refreshIV &&
			refreshTag &&
			accessCiphertext &&
			accessIV &&
			accessTag &&
			accessExpiresAt
		) {
			if (accessExpiresAt < new Date()) {
				// case: access token expired
				// TODO: fetch another access token

				let clientSecret;
				switch (integrationAuth.integration) {
					case 'heroku':
						clientSecret = OAUTH_CLIENT_SECRET_HEROKU;
				}

				// record new access token and refresh token
				// encrypt refresh + access tokens
				const refreshToken = decryptSymmetric({
					ciphertext: refreshCiphertext,
					iv: refreshIV,
					tag: refreshTag,
					key: ENCRYPTION_KEY
				});

				// TODO: make route compatible with other integration types
				const res = await axios.post(
					OAUTH_TOKEN_URL_HEROKU, // maybe shouldn't be a config variable?
					new URLSearchParams({
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
						client_secret: clientSecret
					} as any)
				);

				accessToken = res.data.access_token;

				await processOAuthTokenRes({
					workspaceId: integrationAuth.workspace.toString(),
					integration: integrationAuth.integration,
					res
				});
			} else {
				// case: access token still works
				accessToken = decryptSymmetric({
					ciphertext: accessCiphertext,
					iv: accessIV,
					tag: accessTag,
					key: ENCRYPTION_KEY
				});
			}
		}
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to get OAuth2 access token');
	}

	return accessToken;
};

export { processOAuthTokenRes, getOAuthAccessToken };
