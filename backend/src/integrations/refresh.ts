import axios from 'axios';
import * as Sentry from '@sentry/node';
import { INTEGRATION_AZURE_KEY_VAULT, INTEGRATION_HEROKU } from '../variables';
import {
  SITE_URL,
  CLIENT_ID_AZURE,
  CLIENT_SECRET_AZURE,
  CLIENT_SECRET_HEROKU
} from '../config';
import {
  INTEGRATION_AZURE_TOKEN_URL,
  INTEGRATION_HEROKU_TOKEN_URL
} from '../variables';

interface RefreshTokenAzureResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: 4871;
  access_token: string;
  refresh_token: string;
}

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
      case INTEGRATION_AZURE_KEY_VAULT:
        accessToken = await exchangeRefreshAzure({
          refreshToken
        });
        break;
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
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Azure integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Azure
 * @returns
 */
const exchangeRefreshAzure = async ({
  refreshToken
}: {
  refreshToken: string;
}) => {
  try {
    const res: RefreshTokenAzureResponse = (await axios.post(
      INTEGRATION_AZURE_TOKEN_URL,
       new URLSearchParams({
        client_id: CLIENT_ID_AZURE,
        scope: 'openid offline_access',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        client_secret: CLIENT_SECRET_AZURE
      } as any)
    )).data;
    
    return res.access_token;
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to get refresh OAuth2 access token for Azure'); 
  }
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
            client_secret: CLIENT_SECRET_HEROKU
        } as any)
    );

    accessToken = res.data.access_token;
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed to refresh OAuth2 access token for Heroku');
  }

  return accessToken;
};

export { exchangeRefresh };
