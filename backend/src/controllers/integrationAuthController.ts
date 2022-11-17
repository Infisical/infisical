import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import { readFileSync } from 'fs';
import { IntegrationAuth, Integration } from '../models';
import { processOAuthTokenRes } from '../helpers/integrationAuth';
import { INTEGRATION_SET, ENV_DEV } from '../variables';
import { OAUTH_CLIENT_SECRET_HEROKU, OAUTH_TOKEN_URL_HEROKU } from '../config';

/**
 * Perform OAuth2 code-token exchange as part of integration [integration] for workspace with id [workspaceId]
 * Note: integration [integration] must be set up compatible/designed for OAuth2
 * @param req
 * @param res
 * @returns
 */
export const integrationAuthOauthExchange = async (
	req: Request,
	res: Response
) => {
	try {
		let clientSecret;

		const { workspaceId, code, integration } = req.body;

		if (!INTEGRATION_SET.has(integration))
			throw new Error('Failed to validate integration');

		// use correct client secret
		switch (integration) {
			case 'heroku':
				clientSecret = OAUTH_CLIENT_SECRET_HEROKU;
		}

		// TODO: unfinished - make compatible with other integration types
		const res = await axios.post(
			OAUTH_TOKEN_URL_HEROKU!,
			new URLSearchParams({
				grant_type: 'authorization_code',
				code: code,
				client_secret: clientSecret
			} as any)
		);

		const integrationAuth = await processOAuthTokenRes({
			workspaceId,
			integration,
			res
		});

		// create or replace integration
		const integrationObj = await Integration.findOneAndUpdate(
			{ workspace: workspaceId, integration },
			{
				workspace: workspaceId,
				environment: ENV_DEV,
				isActive: false,
				app: null,
				integration,
				integrationAuth: integrationAuth._id
			},
			{ upsert: true, new: true }
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get OAuth2 token'
		});
	}

	return res.status(200).send({
		message: 'Successfully enabled integration authorization'
	});
};

/**
 * Return list of applications allowed for integration with id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthApps = async (req: Request, res: Response) => {
	// TODO: unfinished - make compatible with other integration types
	let apps;
	try {
		const res = await axios.get('https://api.heroku.com/apps', {
			headers: {
				Accept: 'application/vnd.heroku+json; version=3',
				Authorization: 'Bearer ' + req.accessToken
			}
		});

		apps = res.data.map((a: any) => ({
			name: a.name
		}));
	} catch (err) {}

	return res.status(200).send({
		apps
	});
};

/**
 * Delete integration authorization with id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegrationAuth = async (req: Request, res: Response) => {
	// TODO: unfinished - disable application via Heroku API and make compatible with other integration types
	try {
		const { integrationAuthId } = req.params;

		// TODO: disable application via Heroku API; figure out what authorization id is

		const integrations = JSON.parse(
			readFileSync('./src/json/integrations.json').toString()
		);

		let authorizationId;
		switch (req.integrationAuth.integration) {
			case 'heroku':
				authorizationId = integrations.heroku.clientId;
		}

		// not sure what authorizationId is?
		// // revoke authorization
		// const res2 = await axios.delete(
		//   `https://api.heroku.com/oauth/authorizations/${authorizationId}`,
		//   {
		//     headers: {
		//         'Accept': 'application/vnd.heroku+json; version=3',
		//         'Authorization': 'Bearer ' + req.accessToken
		//     }
		//   }
		// );

		const deletedIntegrationAuth = await IntegrationAuth.findOneAndDelete({
			_id: integrationAuthId
		});

		if (deletedIntegrationAuth) {
			await Integration.deleteMany({
				integrationAuth: deletedIntegrationAuth._id
			});
		}
	} catch (err) {
		return res.status(400).send({
			message: 'Failed to delete integration authorization'
		});
	}
};
