import axios from 'axios';
import * as Sentry from '@sentry/node';
import { INTEGRATION_HEROKU } from '../variables';
import {
    OAUTH_CLIENT_SECRET_HEROKU
} from '../config';
import {
    INTEGRATION_HEROKU_TOKEN_URL
} from '../variables';

/**
 * Return new access token by exchanging refresh token [refreshToken] for integration
 * named [integration]
 * @param {Object} obj
 * @param {String} obj.integration - name of integration
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku 
 */
const exchangeRefresh = async ({
    integration,
    refreshToken
}: {
    integration: string;
    refreshToken: string;
}) => {
    let accessToken;
    try {
        switch (integration) {
            case INTEGRATION_HEROKU:
                accessToken = await exchangeRefreshHeroku({
                    refreshToken
                });
                break;
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get new OAuth2 access token'); 
    }
    
    return accessToken;
}

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Heroku integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku
 * @returns 
 */
const exchangeRefreshHeroku = async ({
    refreshToken
}: {
    refreshToken: string;
}) => {
    let accessToken;
    try {
        const res = await axios.post(
            INTEGRATION_HEROKU_TOKEN_URL,
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_secret: OAUTH_CLIENT_SECRET_HEROKU
            } as any)
        );

        accessToken = res.data.access_token;
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get new OAuth2 access token for Heroku');
    }
    
    return accessToken;
}

export {
    exchangeRefresh
}