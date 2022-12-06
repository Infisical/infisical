import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { Bot } from '../models';
import { validateMembership } from '../helpers/membership';

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
        try {
            const bot = await Bot.findOne({ _id: req[location].botId });
            
            if (!bot) {
                throw new Error('Failed to find bot');
            }
            
            await validateMembership({
                userId: req.user._id.toString(),
                workspaceId: bot.workspace.toString(),
                acceptedRoles,
                acceptedStatuses
            });
            
            req.bot = bot;
            
            next();
        } catch (err) {
            Sentry.setUser(null);
			Sentry.captureException(err);
			return res.status(401).send({
				error: 'Failed bot authorization'
			});
        }
    }
}

export default requireBotAuth;