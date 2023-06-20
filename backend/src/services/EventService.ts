import { Types } from "mongoose";
import { handleEventHelper } from "../helpers/event";

interface Event {
    name: string;
    workspaceId: Types.ObjectId;
    environment?: string;
    payload: any;
}

/**
 * Class to handle events.
 */
class EventService {
    /**
     * Handle event [event]
     * @param {Object} obj
     * @param {Event} obj.event - an event
     * @param {String} obj.event.name - name of event
     * @param {String} obj.event.workspaceId - id of workspace that event is part of
     * @param {Object} obj.event.payload - payload of event (depends on event)
     */
    static async handleEvent({ event }: { event: Event }): Promise<void> {
        await handleEventHelper({
            event,
        });
    }
}

export default EventService;