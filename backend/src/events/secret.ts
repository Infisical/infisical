import { EVENT_PUSH_SECRETS } from '../variables';

interface PushSecret {
	ciphertextKey: string;
	ivKey: string;
	tagKey: string;
	hashKey: string;
	ciphertextValue: string;
	ivValue: string;
	tagValue: string;
	hashValue: string;
	type: 'shared' | 'personal';
}

/**
 * Return event for pushing secrets
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace to push secrets to
 * @param {String} obj.environment - environment for secrets
 * @param {PushSecret[]} obj.secrets - secrets to push
 * @returns 
 */
const eventPushSecrets = ({
    workspaceId,
    environment,
    secrets
}: {
    workspaceId: string;
    environment: string;
    secrets: PushSecret[];
}) => {
    return ({
        name: EVENT_PUSH_SECRETS,
        workspaceId,
        payload: {
            environment,
            secrets
        }
    });
}

export {
    eventPushSecrets
}
