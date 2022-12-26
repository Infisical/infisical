import { Request, Response, NextFunction } from 'express';
import { Bot } from '../models';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireBotAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = 'params'
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const bot = await Bot.findOne({ _id: req[location].botId });
        
        if (!bot) {
            return next(AccountNotFoundError({message: 'Failed to locate Bot account'}))
        }
        
        await validateMembership({
            userId: req.user._id.toString(),
            workspaceId: bot.workspace.toString(),
            acceptedRoles,
            acceptedStatuses
        });
        
        req.bot = bot;
        
        next();
    }
}

export default requireBotAuth;