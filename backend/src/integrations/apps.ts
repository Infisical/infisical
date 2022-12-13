import axios from 'axios';
import * as Sentry from '@sentry/node';
import {
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_HEROKU_API_URL,
    INTEGRATION_VERCEL_API_URL
} from '../variables';

/**
 * Return list of names of apps for integration named [integration]
 * @param {Object} obj
 * @param {String} obj.integration - name of integration
 * @param {String} obj.accessToken - access token for integration
 * @returns {Object[]} apps - names of integration apps
 * @returns {String} apps.name - name of integration app
 */
const getApps = async ({
    integration,
    accessToken
}: {
    integration: string;
    accessToken: string;
}) => {
    let apps;
    try {
        switch (integration) {
            case INTEGRATION_HEROKU:
                apps = await getAppsHeroku({
                    accessToken
                });
                break;
            case INTEGRATION_VERCEL:
                apps = await getAppsVercel({
                    accessToken
                });
                break;
        }

    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get integration apps');
    }
    
    return apps;
}

/**
 * Return list of names of apps for Heroku integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Heroku API
 * @returns {Object[]} apps - names of Heroku apps
 * @returns {String} apps.name - name of Heroku app
 */
const getAppsHeroku = async ({
    accessToken
}: {
    accessToken: string;
}) => {
    let apps;
    try {
        const res = (await axios.get(`${INTEGRATION_HEROKU_API_URL}/apps`, {
            headers: {
                Accept: 'application/vnd.heroku+json; version=3',
                Authorization: `Bearer ${accessToken}`
            }
        })).data;
        
        apps = res.map((a: any) => ({
			name: a.name
		}));
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get Heroku integration apps');
    }
    
    return apps;
}

/**
 * Return list of names of apps for Vercel integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Heroku API
 * @returns {Object[]} apps - names of Heroku apps
 * @returns {String} apps.name - name of Heroku app
 */
const getAppsVercel = async ({
    accessToken
}: {
    accessToken: string;
}) => {
    let apps;
    try {
        const res = (await axios.get(`${INTEGRATION_VERCEL_API_URL}/v9/projects`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })).data;
        
        apps = res.projects.map((a: any) => ({
			name: a.name
		}));
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get Vercel integration apps');
    }
    
    return apps;
}

export {
    getApps
}