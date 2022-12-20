import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import { readFileSync } from 'fs';
import { IntegrationAuth, Integration } from '../models';
import { INTEGRATION_SET, INTEGRATION_OPTIONS, ENV_DEV } from '../variables';
import { IntegrationService } from '../services';
import { getApps, revokeAccess } from '../integrations';

export const getIntegrationOptions = async (
	req: Request,
	res: Response
) => {
	return res.status(200).send({
		integrationOptions: INTEGRATION_OPTIONS
	});
}

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
			integrationAuth: req.integrationAuth,
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
	try {
		const { integrationAuthId } = req.params;

		await revokeAccess({
			integrationAuth: req.integrationAuth,
			accessToken: req.accessToken
		});
	} catch (err) {
		Sentry.setUser(null);
        Sentry.captureException(err);	
		return res.status(400).send({
			message: 'Failed to delete integration authorization'
		});
	}
	
	return res.status(200).send({
		message: 'Successfully deleted integration authorization'
	});
}