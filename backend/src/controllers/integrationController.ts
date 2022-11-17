import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import { Integration } from '../models';
import { decryptAsymmetric } from '../utils/crypto';
import { decryptSecrets } from '../helpers/secret';
import { PRIVATE_KEY } from '../config';

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
 * Return list of all available integrations on Infisical
 * @param req
 * @param res
 * @returns
 */
export const getIntegrations = async (req: Request, res: Response) => {
	let integrations;
	try {
		integrations = JSON.parse(
			readFileSync('./src/json/integrations.json').toString()
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get integrations'
		});
	}

	return res.status(200).send({
		integrations
	});
};

/**
 * Sync secrets [secrets] to integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const syncIntegration = async (req: Request, res: Response) => {
	// TODO: unfinished - make more versatile to accomodate for other integrations
	try {
		const { key, secrets }: { key: Key; secrets: PushSecret[] } = req.body;
		const symmetricKey = decryptAsymmetric({
			ciphertext: key.encryptedKey,
			nonce: key.nonce,
			publicKey: req.user.publicKey,
			privateKey: PRIVATE_KEY
		});

		// decrypt secrets with symmetric key
		const content = decryptSecrets({
			secrets,
			key: symmetricKey,
			format: 'object'
		});

		// TODO: make integration work for other integrations as well
		const res = await axios.patch(
			`https://api.heroku.com/apps/${req.integration.app}/config-vars`,
			content,
			{
				headers: {
					Accept: 'application/vnd.heroku+json; version=3',
					Authorization: 'Bearer ' + req.accessToken
				}
			}
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to sync secrets with integration'
		});
	}

	return res.status(200).send({
		message: 'Successfully synced secrets with integration'
	});
};

/**
 * Change environment or name of integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const modifyIntegration = async (req: Request, res: Response) => {
	let integration;
	try {
		const { update } = req.body;

		integration = await Integration.findOneAndUpdate(
			{
				_id: req.integration._id
			},
			update,
			{
				new: true
			}
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to modify integration'
		});
	}

	return res.status(200).send({
		integration
	});
};

/**
 * Delete integration with id [integrationId]
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
