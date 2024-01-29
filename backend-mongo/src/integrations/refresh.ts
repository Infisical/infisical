import jwt from "jsonwebtoken";
import { standardRequest } from "../config/request";
import { IIntegrationAuth } from "../models";
import {
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_BITBUCKET,
  INTEGRATION_BITBUCKET_TOKEN_URL,
  INTEGRATION_GCP_CLOUD_PLATFORM_SCOPE,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_GCP_TOKEN_URL,
  INTEGRATION_GITLAB,
  INTEGRATION_HEROKU
} from "../variables";
import {
  INTEGRATION_AZURE_TOKEN_URL,
  INTEGRATION_GITLAB_TOKEN_URL,
  INTEGRATION_HEROKU_TOKEN_URL,
} from "../variables";
import { IntegrationService } from "../services";
import {
  getClientIdAzure,
  getClientIdBitBucket,
  getClientIdGCPSecretManager,
  getClientIdGitLab,
  getClientSecretAzure,
  getClientSecretBitBucket,
  getClientSecretGCPSecretManager,
  getClientSecretGitLab,
  getClientSecretHeroku,
  getSiteURL,
} from "../config";

interface RefreshTokenAzureResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: 4871;
  access_token: string;
  refresh_token: string;
}

interface RefreshTokenHerokuResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user_id: string;
}

interface RefreshTokenGitLabResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  created_at: number;
}

interface RefreshTokenBitBucketResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scopes: string;
  state: string;
}

interface ServiceAccountAccessTokenGCPSecretManagerResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface RefreshTokenGCPSecretManagerResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/**
 * Return new access token by exchanging refresh token [refreshToken] for integration
 * named [integration]
 * @param {Object} obj
 * @param {String} obj.integration - name of integration
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku
 */
const exchangeRefresh = async ({
  integrationAuth,
  refreshToken,
}: {
  integrationAuth: IIntegrationAuth;
  refreshToken: string;
}) => {
  interface TokenDetails {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: Date;
  }

  let tokenDetails: TokenDetails;
  switch (integrationAuth.integration) {
    case INTEGRATION_AZURE_KEY_VAULT:
      tokenDetails = await exchangeRefreshAzure({
        refreshToken,
      });
      break;
    case INTEGRATION_HEROKU:
      tokenDetails = await exchangeRefreshHeroku({
        refreshToken,
      });
      break;
    case INTEGRATION_GITLAB:
      tokenDetails = await exchangeRefreshGitLab({
        integrationAuth,
        refreshToken,
      });
      break;
    case INTEGRATION_BITBUCKET:
      tokenDetails = await exchangeRefreshBitBucket({
        refreshToken,
      });
      break;
    case INTEGRATION_GCP_SECRET_MANAGER:
      tokenDetails = await exchangeRefreshGCPSecretManager({
        integrationAuth,
        refreshToken,
      });
      break; 
    default:
      throw new Error("Failed to exchange token for incompatible integration");
  }

  if (
    tokenDetails.accessToken &&
    tokenDetails.refreshToken &&
    tokenDetails.accessExpiresAt
  ) {
    await IntegrationService.setIntegrationAuthAccess({
      integrationAuthId: integrationAuth._id.toString(),
      accessToken: tokenDetails.accessToken,
      accessExpiresAt: tokenDetails.accessExpiresAt,
    });

    await IntegrationService.setIntegrationAuthRefresh({
      integrationAuthId: integrationAuth._id.toString(),
      refreshToken: tokenDetails.refreshToken,
    });
  }

  return tokenDetails.accessToken;
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Azure integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Azure
 * @returns
 */
const exchangeRefreshAzure = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();
  const { data }: { data: RefreshTokenAzureResponse } = await standardRequest.post(
    INTEGRATION_AZURE_TOKEN_URL,
    new URLSearchParams({
      client_id: await getClientIdAzure(),
      scope: "openid offline_access",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_secret: await getClientSecretAzure(),
    } as any)
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt,
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Heroku integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for Heroku
 * @returns
 */
const exchangeRefreshHeroku = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();
  const {
    data,
  }: {
    data: RefreshTokenHerokuResponse;
  } = await standardRequest.post(
    INTEGRATION_HEROKU_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_secret: await getClientSecretHeroku(),
    } as any)
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt,
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GitLab integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for GitLab
 * @returns
 */
const exchangeRefreshGitLab = async ({
  integrationAuth,
  refreshToken,
}: {
  integrationAuth: IIntegrationAuth;
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();
  const url = integrationAuth.url;
  
  const {
    data,
  }: {
    data: RefreshTokenGitLabResponse;
  } = await standardRequest.post(
    url ? `${url}/oauth/token` : INTEGRATION_GITLAB_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: await getClientIdGitLab(),
      client_secret: await getClientSecretGitLab(),
      redirect_uri: `${await getSiteURL()}/integrations/gitlab/oauth2/callback`,
    } as any),
    {
      headers: {
        "Accept-Encoding": "application/json",
      },
    }
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt,
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * BitBucket integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for BitBucket
 * @returns
 */
const exchangeRefreshBitBucket = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();
  const {
    data,
  }: {
    data: RefreshTokenBitBucketResponse;
  } = await standardRequest.post(
    INTEGRATION_BITBUCKET_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: await getClientIdBitBucket(),
      client_secret: await getClientSecretBitBucket(),
      redirect_uri: `${await getSiteURL()}/integrations/bitbucket/oauth2/callback`,
    } as any),
    {
      headers: {
        "Accept-Encoding": "application/json",
      },
    }
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt,
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GCP Secret Manager integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for GCP Secret Manager
 * @returns
 */
const exchangeRefreshGCPSecretManager = async ({
  integrationAuth,
  refreshToken,
}: {
  integrationAuth: IIntegrationAuth;
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();
  
  if (integrationAuth.metadata?.authMethod === "serviceAccount") {
    const serviceAccount = JSON.parse(refreshToken);
        
    const payload = {
      iss: serviceAccount.client_email,
      aud: serviceAccount.token_uri,
      scope: INTEGRATION_GCP_CLOUD_PLATFORM_SCOPE,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = jwt.sign(payload, serviceAccount.private_key, { algorithm: "RS256" });
    
    const { data }: { data: ServiceAccountAccessTokenGCPSecretManagerResponse } = await standardRequest.post(
      INTEGRATION_GCP_TOKEN_URL, 
      new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token
      }).toString(), 
      {
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded" 
        }
      }
    );
    
    accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);
    
    return {
      accessToken: data.access_token,
      refreshToken,
      accessExpiresAt
    };
  }
  
  const { data }: { data: RefreshTokenGCPSecretManagerResponse } = (
    await standardRequest.post(
      INTEGRATION_GCP_TOKEN_URL,
      new URLSearchParams({
        client_id: await getClientIdGCPSecretManager(),
        client_secret: await getClientSecretGCPSecretManager(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      } as any)
    )
  );
  
  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken,
    accessExpiresAt,
  };
};

export { exchangeRefresh };