import axios from 'axios';
import * as Sentry from '@sentry/node';
import {
    INTEGRATION_HEROKU,
    ACTION_PUSH_TO_HEROKU
} from '../variables';
import { 
    OAUTH_CLIENT_SECRET_HEROKU, 
    OAUTH_TOKEN_URL_HEROKU 
} from '../config';

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for OAuth2
 * code-token exchange for integration named [integration]
 * @param {Object} obj1
 * @param {String} obj1.integration - name of integration
 * @param {String} obj1.code - code for code-token exchange
 * @returns {Object} obj
 * @returns {String} obj.accessToken - access token for integration
 * @returns {String} obj.refreshToken - refresh token for integration
 * @returns {Date} obj.accessExpiresAt - date of expiration for access token
 * @returns {String} obj.action - integration action for bot sequence
 */
const exchangeCode = async ({
    integration,
    code
}: { 
    integration: string;
    code: string;
}) => {
    let obj = {} as any;
    try {
        switch (integration) {
            case INTEGRATION_HEROKU:
                obj = await exchangeCodeHeroku({
                    code
                });
                obj['action'] = ACTION_PUSH_TO_HEROKU;
                break;
        } 
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed OAuth2 code-token exchange');
    }
    
    return obj;
}

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Heroku
 * OAuth2 code-token exchange
 * @param {Object} obj1
 * @param {Object} obj1.code - code for code-token exchange
 * @returns {Object} obj2
 * @returns {String} obj2.accessToken - access token for Heroku API
 * @returns {String} obj2.refreshToken - refresh token for Heroku API
 * @returns {Date} obj2.accessExpiresAt - date of expiration for access token
 */
const exchangeCodeHeroku = async ({
    code
}: {
    code: string;
}) => {
    let res: any;
    let accessExpiresAt: any;
    try {
        res = await axios.post(
            OAUTH_TOKEN_URL_HEROKU!,
            new URLSearchParams({
				grant_type: 'authorization_code',
				code: code,
				client_secret: OAUTH_CLIENT_SECRET_HEROKU
			} as any)
        );
        
        accessExpiresAt.setSeconds(
            accessExpiresAt.getSeconds() + res.data.expires_in
        );
    } catch (err) {
        console.error('integrationHerokuExchange');
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed OAuth2 code-token exchange with Heroku');
    }
    
    return ({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        accessExpiresAt
    });
}

export {
    exchangeCode
}