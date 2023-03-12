import request from '../config/request';
import * as Sentry from '@sentry/node';
import {
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_AZURE_TOKEN_URL,
  INTEGRATION_HEROKU_TOKEN_URL,
  INTEGRATION_VERCEL_TOKEN_URL,
  INTEGRATION_NETLIFY_TOKEN_URL,
  INTEGRATION_GITHUB_TOKEN_URL,
  INTEGRATION_GCP_TOKEN_URL
} from '../variables';
import {
  SITE_URL,
  CLIENT_ID_AZURE,
  CLIENT_ID_VERCEL,
  CLIENT_ID_NETLIFY,
  CLIENT_ID_GITHUB,
  CLIENT_ID_GCP_SECRET_MANAGER,
  CLIENT_SECRET_AZURE,
  CLIENT_SECRET_HEROKU,
  CLIENT_SECRET_VERCEL,
  CLIENT_SECRET_NETLIFY,
  CLIENT_SECRET_GITHUB,
  CLIENT_SECRET_GCP_SECRET_MANAGER
} from '../config';

interface ExchangeCodeAzureResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  id_token: string;
}

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

interface ExchangeCodeGithubResponse {
  access_token: string;
  scope: string;
  token_type: string;
}

interface ExchangeCodeGCPSecretManagerResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
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
      case INTEGRATION_AZURE_KEY_VAULT:
        obj = await exchangeCodeAzure({
          code
        });
        break;
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
      case INTEGRATION_GITHUB:
        obj = await exchangeCodeGithub({
          code
        });
        break;
      case INTEGRATION_GCP_SECRET_MANAGER:
        obj = await exchangeCodeGCPSecretManager({
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
};

/**
 * Return [accessToken] for Azure OAuth2 code-token exchange
 * @param param0 
 */
const exchangeCodeAzure = async ({
  code
}: {
  code: string;
}) => {
  const accessExpiresAt = new Date();
  let res: ExchangeCodeAzureResponse;
  try {
    res = (await request.post(
      INTEGRATION_AZURE_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        scope: 'https://vault.azure.net/.default openid offline_access',
        client_id: CLIENT_ID_AZURE,
        client_secret: CLIENT_SECRET_AZURE,
        redirect_uri: `${SITE_URL}/integrations/azure-key-vault/oauth2/callback`
      } as any)
    )).data;

    accessExpiresAt.setSeconds(
      accessExpiresAt.getSeconds() + res.expires_in
    );
  } catch (err: any) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed OAuth2 code-token exchange with Azure');
  }

  return ({
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  });
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
    res = (await request.post(
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
const exchangeCodeVercel = async ({ code }: { code: string }) => {
  let res: ExchangeCodeVercelResponse;
  try {
    res = (
      await request.post(
        INTEGRATION_VERCEL_TOKEN_URL,
        new URLSearchParams({
          code: code,
          client_id: CLIENT_ID_VERCEL,
          client_secret: CLIENT_SECRET_VERCEL,
          redirect_uri: `${SITE_URL}/integrations/vercel/oauth2/callback`
        } as any)
      )
    ).data;
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error(`Failed OAuth2 code-token exchange with Vercel [err=${err}]`);
  }

  return {
    accessToken: res.access_token,
    refreshToken: null,
    accessExpiresAt: null,
    teamId: res.team_id // Custom fields, so do we nee
  };
};

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
const exchangeCodeNetlify = async ({ code }: { code: string }) => {
  let res: ExchangeCodeNetlifyResponse;
  let accountId;
  try {
    res = (
      await request.post(
        INTEGRATION_NETLIFY_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: CLIENT_ID_NETLIFY,
          client_secret: CLIENT_SECRET_NETLIFY,
          redirect_uri: `${SITE_URL}/integrations/netlify/oauth2/callback`
        } as any)
      )
    ).data;

    const res2 = await request.get('https://api.netlify.com/api/v1/sites', {
      headers: {
        Authorization: `Bearer ${res.access_token}`
      }
    });

    const res3 = (
      await request.get('https://api.netlify.com/api/v1/accounts', {
        headers: {
          Authorization: `Bearer ${res.access_token}`
        }
      })
    ).data;

    accountId = res3[0].id;
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed OAuth2 code-token exchange with Netlify');
  }

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accountId
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Github
 * code-token exchange
 * @param {Object} obj1
 * @param {Object} obj1.code - code for code-token exchange
 * @returns {Object} obj2
 * @returns {String} obj2.accessToken - access token for Github API
 * @returns {String} obj2.refreshToken - refresh token for Github API
 * @returns {Date} obj2.accessExpiresAt - date of expiration for access token
 */
const exchangeCodeGithub = async ({ code }: { code: string }) => {
  let res: ExchangeCodeGithubResponse;
  try {
    res = (
      await request.get(INTEGRATION_GITHUB_TOKEN_URL, {
        params: {
          client_id: CLIENT_ID_GITHUB,
          client_secret: CLIENT_SECRET_GITHUB,
          code: code,
          redirect_uri: `${SITE_URL}/integrations/github/oauth2/callback`
        },
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'application/json'
        }
      })
    ).data;

  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed OAuth2 code-token exchange with Github');
  }

  return {
    accessToken: res.access_token,
    refreshToken: null,
    accessExpiresAt: null
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for gcp-secret-manager
 * code-token exchange
 * @param {Object} obj1
 * @param {Object} obj1.code - code for code-token exchange
 * @returns {Object} obj2
 * @returns {String} obj2.accessToken - access token for GCP API
 * @returns {String} obj2.refreshToken - refresh token for GCP API
 * @returns {Date} obj2.accessExpiresAt - date of expiration for access token
 */
const exchangeCodeGCPSecretManager = async ({ code }: { code: string }) => {
  let res: ExchangeCodeGCPSecretManagerResponse;

  try {
    res = (
      await request.post(INTEGRATION_GCP_TOKEN_URL,
        {
          client_id: CLIENT_ID_GCP_SECRET_MANAGER,
          client_secret: CLIENT_SECRET_GCP_SECRET_MANAGER,
          code: code,
          redirect_uri: `${SITE_URL}/integrations/gcp-secret-manager/oauth2/callback`,
          grant_type: "authorization_code"
        }, 
        {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'application/json'
          }
        }
      )
    ).data;

   /**
    * @note the expires_in in response shows the number of seconds after which the access_token
    * expires, so we update the infisical accessExpiresAt value to current-date-in-ms + expires_in
    * in ms
    */
   res.expires_in = Date.now() + (res.expires_in * 1000)
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
    throw new Error('Failed OAuth2 code-token exchange with GCP secret manager');
  }

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt: res.expires_in
  };
};

export { exchangeCode };
