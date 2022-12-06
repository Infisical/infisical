import { Bot, IBot, BotSequence } from '../models';
import * as Sentry from '@sentry/node';
import ActionService from './ActionService';

interface Event {
    name: string;
    workspaceId: string;
    payload: any;
}

/**
 * Class to handle events. TODO: elaborate DOCSTRING.
 */
class EventService {
    /**
     * Check if any bot sequences exist for event and forward
     * bot sequence details to ActionService for execution
     * @param {Object} obj
     * @param {Event} obj.event - an event
     * @param {String} obj.event.name - name of event
     * @param {String} obj.event.workspaceId - id of workspace that event is part of
     * @param {Object} obj.event.payload - payload of event (depends on event)
     */
    static async handleEvent({ event }: { event: Event }): Promise<void> {
        let botSequences;
        let bot: IBot | null;
        try {
            
            console.log('EventService');
            const { workspaceId } = event;

            bot = await Bot.findOne({
                workspace: workspaceId,
                isActive: true
            });
            
            console.log('A', bot);
            // case: bot doesn't exist
            if (!bot) {
                return;
            }
            
            botSequences = await BotSequence.find({
                bot: bot._id,
                event: event.name
            });

            console.log('B', botSequences);
            
            // case: bot sequences don't exist
            if (botSequences.length === 0) return;

            console.log('C');
            
            return;

            // // execute event sequences
            // botSequences.forEach(botSequence => {
            //     // sequence.actions
            //     ActionService.handleAction({
            //         action: botSequence.action,
            //         event,
            //         bot: bot as IBot
            //     });
            // });
            
        } catch (err) {
            console.error('EventService err', err);
            Sentry.setUser(null);
            Sentry.captureException(err);
        }
    }
}

export default EventService;