import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Bot } from '../models';
import { validateMembership } from '../helpers/membership';
import { validateClientForBot } from '../helpers/bot';
import { AccountNotFoundError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireBotAuth = ({
    acceptedRoles,
    locationBotId = 'params'
}: {
    acceptedRoles: Array<'admin' | 'member'>;
    locationBotId?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { botId } = req[locationBotId];
        
        req.bot = await validateClientForBot({
            authData: req.authData,
            botId: new Types.ObjectId(botId),
            acceptedRoles
        });
        
        next();
    }
}

export default requireBotAuth;