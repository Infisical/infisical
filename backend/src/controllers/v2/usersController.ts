import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
    User
} from '../../models';

export const getMe = async (req: Request, res: Response) => {
    /* 
    #swagger.summary = "Retrieve the current user on the request"
    #swagger.description = "Retrieve the current user on the request"
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    $ref: "#/components/schemas/CurrentUser",
                    "description": "Current user on request"
                }
            }           
        }
    }   
    */
    let user;
    try {
        user = await User
            .findById(req.user._id)
            .select('+publicKey +encryptedPrivateKey');
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get user'
		});
    }
    
    return res.status(200).send({
        user
    });
}