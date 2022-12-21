import axios from 'axios';
import * as Sentry from '@sentry/node';
import {
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_HEROKU_TOKEN_URL,
    INTEGRATION_VERCEL_TOKEN_URL,
    INTEGRATION_NETLIFY_TOKEN_URL,
    ACTION_PUSH_TO_HEROKU
} from '../variables';
import { 
    SITE_URL,
    CLIENT_SECRET_HEROKU,
    CLIENT_ID_VERCEL,
    CLIENT_ID_NETLIFY,
    CLIENT_SECRET_VERCEL,
    CLIENT_SECRET_NETLIFY
} from '../config';

interface ExchangeCodeHerokuResponse {
    token_type: string;
    access_token: string;
    expires_in: number;
    refresh_token: string;
    user_id: string;
    session_nonce?: string;
}

interface ExchangeCodeVercelResponse {
    token_type: string;
    access_token: string;
    installation_id: string;
    user_id: string;
    team_id?: string;
}

interface ExchangeCodeNetlifyResponse {
    access_token: string;
    token_type: string;
    refresh_token: string;
    scope: string;
    created_at: number;
}

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
                break;
            case INTEGRATION_VERCEL:
                obj = await exchangeCodeVercel({
                    code
                });
                break;
            case INTEGRATION_NETLIFY:
                obj = await exchangeCodeNetlify({
                    code
                });
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
    let res: ExchangeCodeHerokuResponse;
    const accessExpiresAt = new Date();
    try {
        res = (await axios.post(
            INTEGRATION_HEROKU_TOKEN_URL,
            new URLSearchParams({
				grant_type: 'authorization_code',
				code: code,
				client_secret: CLIENT_SECRET_HEROKU
			} as any)
        )).data;
        
        accessExpiresAt.setSeconds(
            accessExpiresAt.getSeconds() + res.expires_in
        );
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed OAuth2 code-token exchange with Heroku');
    }
    
    return ({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        accessExpiresAt
    });
}

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Vercel
 * code-token exchange
 * @param {Object} obj1
 * @param {Object} obj1.code - code for code-token exchange
 * @returns {Object} obj2
 * @returns {String} obj2.accessToken - access token for Heroku API
 * @returns {String} obj2.refreshToken - refresh token for Heroku API
 * @returns {Date} obj2.accessExpiresAt - date of expiration for access token
 */
const exchangeCodeVercel = async ({
    code
}: {
    code: string;
}) => {
    let res: ExchangeCodeVercelResponse;
    try {
        res = (await axios.post(
            INTEGRATION_VERCEL_TOKEN_URL,
            new URLSearchParams({
				code: code,
                client_id: CLIENT_ID_VERCEL,
				client_secret: CLIENT_SECRET_VERCEL,
                redirect_uri: `${SITE_URL}/vercel`
			} as any)
        )).data;
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed OAuth2 code-token exchange with Vercel');
    }
    
    return ({
        accessToken: res.access_token,
        refreshToken: null,
        accessExpiresAt: null,
        teamId: res.team_id
    });
}

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Vercel
 * code-token exchange
 * @param {Object} obj1
 * @param {Object} obj1.code - code for code-token exchange
 * @returns {Object} obj2
 * @returns {String} obj2.accessToken - access token for Heroku API
 * @returns {String} obj2.refreshToken - refresh token for Heroku API
 * @returns {Date} obj2.accessExpiresAt - date of expiration for access token
 */
const exchangeCodeNetlify = async ({
    code
}: {
    code: string;
}) => {
    let res: ExchangeCodeNetlifyResponse;
    let accountId;
    try {
        res = (await axios.post(
            INTEGRATION_NETLIFY_TOKEN_URL,
            new URLSearchParams({
                grant_type: 'authorization_code',
				code: code,
                client_id: CLIENT_ID_NETLIFY,
				client_secret: CLIENT_SECRET_NETLIFY,
                redirect_uri: `${SITE_URL}/netlify`
			} as any)
        )).data;

        const res2 = await axios.get(
            'https://api.netlify.com/api/v1/sites',
            {
                headers: {
                    Authorization: `Bearer ${res.access_token}`
                }
            }
        );
        
        const res3 = (await axios.get(
            'https://api.netlify.com/api/v1/accounts',
            {
                headers: {
                    Authorization: `Bearer ${res.access_token}`
                }
            }
        )).data;
        
        accountId = res3[0].id;

    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed OAuth2 code-token exchange with Netlify');
    }
    
    return ({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        accountId
    });
}

export {
    exchangeCode
}