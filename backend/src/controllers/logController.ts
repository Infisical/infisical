import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
    Log
} from '../models';


export const getLogs = async (req: Request, res: Response) => {
    // get logs
    
    console.log('getLogs');
    let logs;
    try {
        const { workspaceId } = req.params;
        
        logs = await Log.find({
            workspace: workspaceId
        });
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get audit logs'
		});
    }
    
    return res.status(200).send({
        logs
    });
}