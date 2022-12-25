import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { SecretVersion } from '../models';

/**
 * Return secret versions for secret with id [secretId]
 * @param req 
 * @param res 
 */
 export const getSecretVersions = async (req: Request, res: Response) => {
	let secretVersions;
	try {
		const { secretId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		
		secretVersions = await SecretVersion.find({
			secret: secretId
		})
		.skip(offset)
		.limit(limit);

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get secret versions'
		});
	}
	
	return res.status(200).send({
		secretVersions
	});
}