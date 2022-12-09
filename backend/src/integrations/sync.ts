import axios from 'axios';
import * as Sentry from '@sentry/node';
import { INTEGRATION_HEROKU } from '../variables';

/**
 * Sync/push [secrets] to [app] in integration named [integration]
 * @param {Object} obj
 * @param {Object} obj.integration - name of integration
 * @param {Object} obj.app - app in integration
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 * @param {String} obj.accessToken - access token for integration
 */
const syncSecrets = async ({
    integration,
    app,
    secrets,
    accessToken
}: {
    integration: string;
    app: string;
    secrets: any;
    accessToken: string;
}) => {
    try {
        switch (integration) {
            case INTEGRATION_HEROKU:
                await syncSecretsHeroku({
                    app,
                    secrets,
                    accessToken
                });
                break;
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to integration');
    }
}

/**
 * Sync/push [secrets] to Heroku [app]
 * @param {Object} obj
 * @param {String} obj.app - app in integration
 * @param {Object} obj.secrets - secrets to push to integration (object where keys are secret keys and values are secret values)
 */
const syncSecretsHeroku = async ({
    app,
    secrets,
    accessToken
}: {
    app: string;
    secrets: any;
    accessToken: string;
}) => {
    try {
        await axios.patch(
			`https://api.heroku.com/apps/${app}/config-vars`,
		    secrets,
			{
				headers: {
					Accept: 'application/vnd.heroku+json; version=3',
					Authorization: 'Bearer ' + accessToken
				}
			}
		);
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to sync secrets to Heroku');
    }
}

export {
    syncSecrets
}