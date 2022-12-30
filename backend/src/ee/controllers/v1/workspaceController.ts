import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { SecretSnapshot } from '../../models';

/**
 * Return secret snapshots for workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
 export const getWorkspaceSecretSnapshots = async (req: Request, res: Response) => {
	let secretSnapshots;
	try {
		const { workspaceId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		
		secretSnapshots = await SecretSnapshot.find({
			workspace: workspaceId
		})
		.skip(offset)
		.limit(limit);

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get secret snapshots'
		});
	}
	
	return res.status(200).send({
		secretSnapshots
	});
}