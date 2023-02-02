import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { 
	Integration, 
	Workspace,
	Bot, 
	BotKey 
} from '../../models';
import { EventService } from '../../services';
import { eventPushSecrets } from '../../events';

/**
 * Create/initialize an (empty) integration for integration authorization
 * @param req 
 * @param res 
 * @returns 
 */
export const createIntegration = async (req: Request, res: Response) => {
	let integration;
	try {
		// initialize new integration after saving integration access token
        integration = await new Integration({
            workspace: req.integrationAuth.workspace._id,
            isActive: false,
            app: null,
            environment: req.integrationAuth.workspace?.environments[0].slug,
            integration: req.integrationAuth.integration,
            integrationAuth: req.integrationAuth._id
        }).save();
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to create integration'
		});
	}

	return res.status(200).send({
		integration
	});
}

/**
 * Change environment or name of integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const updateIntegration = async (req: Request, res: Response) => {
	let integration;
	
	// TODO: add integration-specific validation to ensure that each
	// integration has the correct fields populated in [Integration]
	
	try {
		const { 
			environment, 
			isActive, 
			app, 
			appId,
			targetEnvironment,
			owner, // github-specific integration param
		} = req.body;
		
		integration = await Integration.findOneAndUpdate(
			{
				_id: req.integration._id
			},
			{
				environment,
				isActive,
				app,
				appId,
				targetEnvironment,
				owner
			},
			{
				new: true
			}
		);
		
		if (integration) {
			// trigger event - push secrets
			EventService.handleEvent({
				event: eventPushSecrets({
					workspaceId: integration.workspace.toString()
				})
			});
		}
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to update integration'
		});
	}

	return res.status(200).send({
		integration
	});
};

/**
 * Delete integration with id [integrationId] and deactivate bot if there are
 * no integrations left
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegration = async (req: Request, res: Response) => {
	let integration;
	try {
		const { integrationId } = req.params;

		integration = await Integration.findOneAndDelete({
			_id: integrationId
		});
		
		if (!integration) throw new Error('Failed to find integration');
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to delete integration'
		});
	}
	
	return res.status(200).send({
		integration
	});
};
