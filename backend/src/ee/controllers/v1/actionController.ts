import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Action } from '../../models';

export const getAction = (req: Request, res: Response) => {
    let action;
    // try {
    //     const { actionId } = req.params;
        
    //     action = await Action.findById(actionId);
        
        
    // } catch (err) {

    // }
    
    return res.status(200).send({
        action
    });
}