import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import * as Sentry from '@sentry/node';
import { Integration, Bot, BotKey } from '../../models';
import { EventService } from '../../services';
import { eventPushSecrets } from '../../events';

interface Key {
	encryptedKey: string;
	nonce: string;
}

interface PushSecret {
	ciphertextKey: string;
	ivKey: string;
	tagKey: string;
	hashKey: string;
	ciphertextValue: string;
	ivValue: string;
	tagValue: string;
	hashValue: string;
	type: 'shared' | 'personal';
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
			app, 
			environment, 
			isActive, 
			target, // vercel-specific integration param
			context, // netlify-specific integration param
			siteId // netlify-specific integration param
		} = req.body;
		
		integration = await Integration.findOneAndUpdate(
			{
				_id: req.integration._id
			},
			{
				environment,
				isActive,
				app,
				target,
				context,
				siteId
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
	let deletedIntegration;
	try {
		const { integrationId } = req.params;

		deletedIntegration = await Integration.findOneAndDelete({
			_id: integrationId
		});
		
		if (!deletedIntegration) throw new Error('Failed to find integration');
		
		const integrations = await Integration.find({
			workspace: deletedIntegration.workspace
		});
			
		if (integrations.length === 0) {
			// case: no integrations left, deactivate bot
			const bot = await Bot.findOneAndUpdate({
				workspace: deletedIntegration.workspace
			}, {
				isActive: false
			}, {
				new: true
			});
			
			if (bot) {
				await BotKey.deleteOne({
					bot: bot._id
				});
			}
		}
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to delete integration'
		});
	}

	return res.status(200).send({
		deletedIntegration
	});
};
