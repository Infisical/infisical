import e, { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { 
	SecretSnapshot,
	Log
} from '../../models';

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

/**
 * Return count of secret snapshots for workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const getWorkspaceSecretSnapshotsCount = async (req: Request, res: Response) => {
	let count;
	try {
		const { workspaceId } = req.params;
		count = await SecretSnapshot.countDocuments({
			workspace: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to count number of secret snapshots'
		});
	}
	
	return res.status(200).send({
		count
	});
}

/**
 * Return (audit) logs for workspace with id [workspaceId]
 * @param req 
 * @param res 
 * @returns 
 */
export const getWorkspaceLogs = async (req: Request, res: Response) => {
	let logs
	try {
		const { workspaceId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		const sortBy: string = req.query.sortBy as string;
		const userId: string = req.query.userId as string;
		const actionNames: string = req.query.actionNames as string;
		
		logs = await Log.find({
			workspace: workspaceId,
			...( userId ? { user: userId } : {}),
			...( 
				actionNames 
				? { 
					actionNames: {
						$in: actionNames.split(',')
					}
				} : {}
			)
		})
		.sort({ createdAt: sortBy === 'recent' ? -1 : 1 })
		.skip(offset)
		.limit(limit)
		.populate('actions')
		.populate('user');

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace logs'
		});
	}
	
	return res.status(200).send({
		logs
	});
}