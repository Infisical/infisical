import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { SecretSnapshot } from '../../models';

/**
 * Return secret snapshot with id [secretSnapshotId]
 * @param req 
 * @param res 
 * @returns 
 */
export const getSecretSnapshot = async (req: Request, res: Response) => {
    let secretSnapshot;
    try {
        const { secretSnapshotId } = req.params;

        secretSnapshot = await SecretSnapshot
            .findById(secretSnapshotId)
            .populate({
                path: 'secretVersions',
                populate: {
                    path: 'tags',
                    model: 'Tag',
                }
            });
        
        if (!secretSnapshot) throw new Error('Failed to find secret snapshot');
        
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get secret snapshot'
		});
    }
    
    return res.status(200).send({
        secretSnapshot
    });
}