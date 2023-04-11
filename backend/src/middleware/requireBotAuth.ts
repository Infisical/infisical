import { Request, Response, NextFunction } from 'express';
import { Bot } from '../models';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

// TODO: transform

const requireBotAuth = ({
    acceptedRoles,
    location = 'params'
}: {
    acceptedRoles: Array<'admin' | 'member'>;
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const bot = await Bot.findById(req[location].botId);
        
        if (!bot) {
            return next(AccountNotFoundError({message: 'Failed to locate Bot account'}))
        }
        
        await validateMembership({
            userId: req.user._id,
            workspaceId: bot.workspace,
            acceptedRoles
        });
        
        req.bot = bot;
        
        next();
    }
}

export default requireBotAuth;