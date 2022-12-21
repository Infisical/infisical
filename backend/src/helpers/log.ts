import { Log, ILog } from '../models';
import * as Sentry from '@sentry/node';
import {
    EVENT_PUSH_SECRETS,
    EVENT_PULL_SECRETS
} from '../variables';


const handleLogHelper = async ({
    log
}: {
    log: ILog
}) => {
    try {
        switch (log.event) {
            case EVENT_PULL_SECRETS:
                // TODO
                break;
        }

    } catch (err){
        Sentry.setUser(null);
        Sentry.captureException(err);
    }
}