import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import { readFileSync } from 'fs';
import { IntegrationAuth, Integration } from '../models';
import { INTEGRATION_SET, ENV_DEV } from '../variables';
import { IntegrationService } from '../services';
import { getApps } from '../integrations';

/**
 * Perform OAuth2 code-token exchange as part of integration [integration] for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const oAuthExchange = async (
	req: Request,
	res: Response
) => {
	try {
		const { workspaceId, code, integration } = req.body;

		if (!INTEGRATION_SET.has(integration))
			throw new Error('Failed to validate integration');
	
		await IntegrationService.handleOAuthExchange({
			workspaceId,
			integration,
			code
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get OAuth2 code-token exchange'
		});
	}

	return res.status(200).send({
		message: 'Successfully enabled integration authorization'
	});
};

/**
 * Return list of applications allowed for integration with integration authorization id [integrationAuthId]
 * @param req
 * @param res
 * @returns
 */
export const getIntegrationAuthApps = async (req: Request, res: Response) => {
	let apps;
	try {
		apps = await getApps({
			integration: req.integrationAuth.integration,
			accessToken: req.accessToken
		});
	} catch (err) {
		Sentry.setUser(null);
        Sentry.captureException(err);	
		return res.status(400).send({
			message: 'Failed to get integration authorization applications'
		});
	}

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
