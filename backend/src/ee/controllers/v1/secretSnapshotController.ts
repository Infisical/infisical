import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { SecretSnapshot } from '../../models';

export const getSecretSnapshot = async (req: Request, res: Response) => {
    let secretSnapshot;
    try {
        const { secretSnapshotId } = req.params;

        secretSnapshot = await SecretSnapshot
            .findById(secretSnapshotId)
            .populate('secretVersions');
        
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