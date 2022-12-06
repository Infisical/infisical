import * as Sentry from '@sentry/node';
import { IBot } from '../models';
import { ACTION_PUSH_TO_HEROKU } from '../variables';
import { actionPushToHeroku } from '../actions';

interface Event {
    name: string;
    workspaceId: string;
    payload: any;
}

/**
 * Class to handle actions
 */
class ActionService {
    /**
     * @param {Object} obj
     * @param {String} action - name of action to trigger
     * @param {Event} event 
     * @param {String} obj.event.name - name of event
     * @param {String} obj.event.workspaceId - id of workspace that event is part of
     * @param {Object} obj.event.payload - payload of event (depends on event)
     * @param bot
     * @returns 
     */
    static async handleAction({
        action,
        event,
        bot
    }: {
        action: string;
        event: Event;
        bot: IBot;
    }) {
        try {
            switch (action) {
                case ACTION_PUSH_TO_HEROKU:
                    actionPushToHeroku({
                        event,
                        bot
                    });
                    return;
                default:
                    return;
            }
        } catch (err) {
            console.error('EventService err', err);
            Sentry.setUser(null);
            Sentry.captureException(err);
        }
    }
}

export default ActionService;