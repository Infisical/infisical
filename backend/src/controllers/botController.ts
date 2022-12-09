import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Bot, BotKey } from '../models';
import { createBot } from '../helpers/bot';

interface BotKey {
    encryptedKey: string;
    nonce: string;
}

/**
 * Return bot for workspace with id [workspaceId]. If a workspace bot doesn't exist,
 * then create and return a new bot.
 * @param req
 * @param res
 * @returns
 */
export const getBotByWorkspaceId = async (req: Request, res: Response) => {
    let bot;
	try {
        const { workspaceId } = req.params;

        bot = await Bot.findOne({
            workspace: workspaceId
        });
        
        if (!bot) {
            // case: bot doesn't exist for workspace with id [workspaceId]
            // -> create a new bot and return it
            bot = await createBot({
                name: 'Infisical Bot',
                workspaceId
            });
        }
	} catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
        return res.status(400).send({
			message: 'Failed to get bot for workspace'
		});
	}
    
    return res.status(200).send({
        bot
    });
};

/**
 * Return bot with id [req.bot._id] with active state set to [isActive].
 * @param req
 * @param res
 * @returns
 */
export const setBotActiveState = async (req: Request, res: Response) => {
    let bot;
	try {
        const { isActive, botKey }: { isActive: boolean, botKey: BotKey } = req.body;
        
        if (isActive) {
            // bot state set to active -> share workspace key with bot
            if (!botKey?.encryptedKey || !botKey?.nonce) {
                return res.status(400).send({
                    message: 'Failed to set bot state to active - missing bot key'
                });
            }
            
            await BotKey.findOneAndUpdate({
                workspace: req.bot.workspace
            }, {
                encryptedKey: botKey.encryptedKey,
                nonce: botKey.nonce,
                sender: req.user._id,
                bot: req.bot._id,
                workspace: req.bot.workspace
            }, {
                upsert: true,
                new: true
            });
        } else {
            // case: bot state set to inactive -> delete bot's workspace key
            await BotKey.deleteOne({
                bot: req.bot._id
            });
        }

        bot = await Bot.findOneAndUpdate({
            _id: req.bot._id
        }, {
            isActive
        }, {
            new: true
        });
        
        if (!bot) throw new Error('Failed to update bot active state');
        
	} catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
        return res.status(400).send({
			message: 'Failed to update bot active state'
		});
	}
    
    return res.status(200).send({
        bot
    });
};
