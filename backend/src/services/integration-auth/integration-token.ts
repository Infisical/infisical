import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";

import { Integrations, IntegrationUrls } from "./integration-list";

type ExchangeCodeAzureResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  id_token: string;
};

type ExchangeCodeGCPResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
};

type ExchangeCodeHerokuResponse = {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  user_id: string;
  session_nonce?: string;
};

type ExchangeCodeVercelResponse = {
  token_type: string;
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id?: string;
};

type ExchangeCodeNetlifyResponse = {
  access_token: string;
  token_type: string;
  refresh_token: string;
  scope: string;
  created_at: number;
};

type ExchangeCodeGithubResponse = {
  access_token: string;
  scope: string;
  token_type: string;
};

type ExchangeCodeGitlabResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
};

type ExchangeCodeBitbucketResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scopes: string;
  state: string;
};

const exchangeCodeGCP = async ({ code }: { code: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_GCP_SECRET_MANAGER || !appCfg.CLIENT_ID_GCP_SECRET_MANAGER) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeGCPResponse>(
      IntegrationUrls.GCP_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: appCfg.CLIENT_ID_GCP_SECRET_MANAGER,
        client_secret: appCfg.CLIENT_SECRET_GCP_SECRET_MANAGER,
        redirect_uri: `${appCfg.SITE_URL}/integrations/gcp-secret-manager/oauth2/callback`
      })
    )
  ).data;

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  };
};

const exchangeCodeAzure = async ({ code }: { code: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_AZURE || !appCfg.CLIENT_SECRET_AZURE) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const res = (
    await request.post<ExchangeCodeAzureResponse>(
      IntegrationUrls.AZURE_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        scope: "https://vault.azure.net/.default openid offline_access",
        client_id: appCfg.CLIENT_ID_AZURE,
        client_secret: appCfg.CLIENT_SECRET_AZURE,
        redirect_uri: `${appCfg.SITE_URL}/integrations/azure-key-vault/oauth2/callback`
      })
    )
  ).data;

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  };
};

const exchangeCodeAzureAppConfig = async ({ code }: { code: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_AZURE || !appCfg.CLIENT_SECRET_AZURE) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const res = (
    await request.post<ExchangeCodeAzureResponse>(
      IntegrationUrls.AZURE_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        scope: "https://azconfig.io/.default openid offline_access",
        client_id: appCfg.CLIENT_ID_AZURE,
        client_secret: appCfg.CLIENT_SECRET_AZURE,
        redirect_uri: `${appCfg.SITE_URL}/integrations/azure-app-configuration/oauth2/callback`
      })
    )
  ).data;

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  };
};

const exchangeCodeHeroku = async ({ code }: { code: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_HEROKU) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeHerokuResponse>(
      IntegrationUrls.HEROKU_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: appCfg.CLIENT_SECRET_HEROKU
      })
    )
  ).data;
  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Vercel
 * code-token exchange
 */
const exchangeCodeVercel = async ({ code }: { code: string }) => {
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_VERCEL || !appCfg.CLIENT_SECRET_VERCEL) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeVercelResponse>(
      IntegrationUrls.VERCEL_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: appCfg.CLIENT_ID_VERCEL,
        client_secret: appCfg.CLIENT_SECRET_VERCEL,
        redirect_uri: `${appCfg.SITE_URL}/integrations/vercel/oauth2/callback`
      })
    )
  ).data;

  return {
    accessToken: res.access_token,
    refreshToken: null,
    accessExpiresAt: null,
    teamId: res.team_id
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Vercel
 * code-token exchange
 */
const exchangeCodeNetlify = async ({ code }: { code: string }) => {
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_NETLIFY || !appCfg.CLIENT_SECRET_NETLIFY) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeNetlifyResponse>(
      IntegrationUrls.NETLIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: appCfg.CLIENT_ID_NETLIFY,
        client_secret: appCfg.CLIENT_SECRET_NETLIFY,
        redirect_uri: `${appCfg.SITE_URL}/integrations/netlify/oauth2/callback`
      })
    )
  ).data;

  // akhilmhdh: commented out by me. Not sure why its being called but never used in prev codebase
  // const res2 = await request.get("https://api.netlify.com/api/v1/sites", {
  //   headers: {
  //     Authorization: `Bearer ${res.access_token}`
  //   }
  // });

  const res3 = (
    await request.get<Array<{ id: string }>>("https://api.netlify.com/api/v1/accounts", {
      headers: {
        Authorization: `Bearer ${res.access_token}`
      }
    })
  ).data;

  const accountId = res3[0].id;

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accountId
  };
};

const exchangeCodeGithub = async ({ code, installationId }: { code: string; installationId?: string }) => {
  const appCfg = getConfig();

  if (!installationId && (!appCfg.CLIENT_ID_GITHUB || !appCfg.CLIENT_SECRET_GITHUB)) {
    throw new InternalServerError({ message: "Missing client id and client secret" });
  }

  if (installationId && (!appCfg.CLIENT_ID_GITHUB_APP || !appCfg.CLIENT_SECRET_GITHUB_APP)) {
    throw new InternalServerError({
      message: "Missing Github app client ID and client secret"
    });
  }

  if (installationId) {
    // handle app installations
    const oauthRes = (
      await request.get<ExchangeCodeGithubResponse>(IntegrationUrls.GITHUB_TOKEN_URL, {
        params: {
          client_id: appCfg.CLIENT_ID_GITHUB_APP,
          client_secret: appCfg.CLIENT_SECRET_GITHUB_APP,
          code,
          redirect_uri: `${appCfg.SITE_URL}/integrations/github/oauth2/callback`
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    // use access token to validate installation ID
    const installationsRes = (
      await request.get<{
        installations: {
          id: number;
          account: {
            login: string;
          };
        }[];
      }>(IntegrationUrls.GITHUB_USER_INSTALLATIONS, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${oauthRes.access_token}`,
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    const matchingInstallation = installationsRes.installations.find(
      (installation) => installation.id === +installationId
    );

    if (!matchingInstallation) {
      throw new ForbiddenRequestError({
        message: "User has no access to the provided installation"
      });
    }

    return {
      accessToken: "", // for github app integrations, we only need the installationID from the metadata
      refreshToken: null,
      accessExpiresAt: null,
      installationName: matchingInstallation.account.login
    };
  }

  // handle oauth github integration
  const res = (
    await request.get<ExchangeCodeGithubResponse>(IntegrationUrls.GITHUB_TOKEN_URL, {
      params: {
        client_id: appCfg.CLIENT_ID_GITHUB,
        client_secret: appCfg.CLIENT_SECRET_GITHUB,
        code,
        redirect_uri: `${appCfg.SITE_URL}/integrations/github/oauth2/callback`
      },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  return {
    accessToken: res.access_token,
    refreshToken: null,
    accessExpiresAt: null
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Gitlab
 * code-token exchange
 */
const exchangeCodeGitlab = async ({ code, url }: { code: string; url?: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_GITLAB || !appCfg.CLIENT_SECRET_GITLAB) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeGitlabResponse>(
      url ? `${url}/oauth/token` : IntegrationUrls.GITLAB_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: appCfg.CLIENT_ID_GITLAB,
        client_secret: appCfg.CLIENT_SECRET_GITLAB,
        redirect_uri: `${appCfg.SITE_URL}/integrations/gitlab/oauth2/callback`
      }),
      {
        headers: {
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data;

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt,
    url
  };
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for Bitbucket
 * code-token exchange
 */
const exchangeCodeBitbucket = async ({ code }: { code: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_BITBUCKET || !appCfg.CLIENT_ID_BITBUCKET) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const res = (
    await request.post<ExchangeCodeBitbucketResponse>(
      IntegrationUrls.BITBUCKET_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: appCfg.CLIENT_ID_BITBUCKET,
        client_secret: appCfg.CLIENT_SECRET_BITBUCKET,
        redirect_uri: `${appCfg.SITE_URL}/integrations/bitbucket/oauth2/callback`
      }),
      {
        headers: {
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data;

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + res.expires_in);

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt
  };
};

type TExchangeReturn = {
  accessToken: string;
  refreshToken?: string | null;
  accessExpiresAt?: Date | null;
  url?: string;
  teamId?: string;
  accountId?: string;
  installationName?: string;
};

/**
 * Return [accessToken], [accessExpiresAt], and [refreshToken] for OAuth2
 * code-token exchange for integration named [integration]
 */
export const exchangeCode = async ({
  integration,
  code,
  url,
  installationId
}: {
  integration: string;
  code: string;
  url?: string;
  installationId?: string;
}): Promise<TExchangeReturn> => {
  switch (integration) {
    case Integrations.GCP_SECRET_MANAGER:
      return exchangeCodeGCP({
        code
      });
    case Integrations.AZURE_KEY_VAULT:
      return exchangeCodeAzure({
        code
      });
    case Integrations.AZURE_APP_CONFIGURATION:
      return exchangeCodeAzureAppConfig({
        code
      });
    case Integrations.HEROKU:
      return exchangeCodeHeroku({
        code
      });
    case Integrations.VERCEL:
      return exchangeCodeVercel({
        code
      });
    case Integrations.NETLIFY:
      return exchangeCodeNetlify({
        code
      });
    case Integrations.GITHUB:
      return exchangeCodeGithub({
        code,
        installationId
      });
    case Integrations.GITLAB:
      return exchangeCodeGitlab({
        code,
        url
      });
    case Integrations.BITBUCKET:
      return exchangeCodeBitbucket({
        code
      });
    default:
      throw new NotFoundError({ message: "Unknown integration" });
  }
};

type RefreshTokenAzureResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: 4871;
  access_token: string;
  refresh_token: string;
};

type RefreshTokenHerokuResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user_id: string;
};

type RefreshTokenGitLabResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  created_at: number;
};

type RefreshTokenBitbucketResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scopes: string;
  state: string;
};

type ServiceAccountAccessTokenGCPSecretManagerResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type RefreshTokenGCPSecretManagerResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Azure integration
 */
const exchangeRefreshAzure = async ({ refreshToken }: { refreshToken: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_AZURE || !appCfg.CLIENT_SECRET_AZURE) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }

  const { data }: { data: RefreshTokenAzureResponse } = await request.post(
    IntegrationUrls.AZURE_TOKEN_URL,
    new URLSearchParams({
      client_id: appCfg.CLIENT_ID_AZURE,
      scope: "openid offline_access",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_secret: appCfg.CLIENT_SECRET_AZURE
    })
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Heroku integration
 */
const exchangeRefreshHeroku = async ({ refreshToken }: { refreshToken: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_HEROKU) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const {
    data
  }: {
    data: RefreshTokenHerokuResponse;
  } = await request.post(
    IntegrationUrls.HEROKU_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_secret: appCfg.CLIENT_SECRET_HEROKU
    })
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GitLab integration
 * @param {Object} obj
 * @param {String} obj.refreshToken - refresh token to use to get new access token for GitLab
 * @returns
 */
const exchangeRefreshGitLab = async ({ refreshToken, url }: { url?: string | null; refreshToken: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_ID_GITLAB || !appCfg.CLIENT_SECRET_GITLAB) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const {
    data
  }: {
    data: RefreshTokenGitLabResponse;
  } = await request.post(
    url ? `${url}/oauth/token` : IntegrationUrls.GITLAB_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appCfg.CLIENT_ID_GITLAB,
      client_secret: appCfg.CLIENT_SECRET_GITLAB,
      redirect_uri: `${appCfg.SITE_URL}/integrations/gitlab/oauth2/callback`
    }),
    {
      headers: {
        "Accept-Encoding": "application/json"
      }
    }
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * Bitbucket integration
 */
const exchangeRefreshBitbucket = async ({ refreshToken }: { refreshToken: string }) => {
  const accessExpiresAt = new Date();
  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_BITBUCKET || !appCfg.CLIENT_ID_BITBUCKET) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const {
    data
  }: {
    data: RefreshTokenBitbucketResponse;
  } = await request.post(
    IntegrationUrls.BITBUCKET_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appCfg.CLIENT_ID_BITBUCKET,
      client_secret: appCfg.CLIENT_SECRET_BITBUCKET,
      redirect_uri: `${appCfg.SITE_URL}/integrations/bitbucket/oauth2/callback`
    }),
    {
      headers: {
        "Accept-Encoding": "application/json"
      }
    }
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for the
 * GCP Secret Manager integration
 */
const exchangeRefreshGCPSecretManager = async ({
  refreshToken,
  metadata = {}
}: {
  metadata?: Record<string, string>;
  refreshToken: string;
}) => {
  const accessExpiresAt = new Date();

  if (metadata?.authMethod === "serviceAccount") {
    const serviceAccount = JSON.parse(refreshToken) as {
      client_email: string;
      token_uri: string;
      private_key: string;
    };

    const payload = {
      iss: serviceAccount.client_email,
      aud: serviceAccount.token_uri,
      scope: IntegrationUrls.GCP_CLOUD_PLATFORM_SCOPE,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = crypto.jwt().sign(payload, serviceAccount.private_key, { algorithm: "RS256" });

    const { data }: { data: ServiceAccountAccessTokenGCPSecretManagerResponse } = await request.post(
      IntegrationUrls.GCP_TOKEN_URL,
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

  const appCfg = getConfig();
  if (!appCfg.CLIENT_SECRET_GCP_SECRET_MANAGER || !appCfg.CLIENT_ID_GCP_SECRET_MANAGER) {
    throw new BadRequestError({ message: "Missing client id and client secret" });
  }
  const { data } = await request.post<RefreshTokenGCPSecretManagerResponse>(
    IntegrationUrls.GCP_TOKEN_URL,
    new URLSearchParams({
      client_id: appCfg.CLIENT_ID_GCP_SECRET_MANAGER,
      client_secret: appCfg.CLIENT_SECRET_GCP_SECRET_MANAGER,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  );

  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  return {
    accessToken: data.access_token,
    refreshToken,
    accessExpiresAt
  };
};

/**
 * Return new access token by exchanging refresh token [refreshToken] for integration
 */
export const exchangeRefresh = async (
  integration: string,
  refreshToken: string,
  url?: string | null,
  metadata?: Record<string, string>
): Promise<{
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
}> => {
  switch (integration) {
    case Integrations.AZURE_APP_CONFIGURATION:
    case Integrations.AZURE_KEY_VAULT:
      return exchangeRefreshAzure({
        refreshToken
      });
    case Integrations.HEROKU:
      return exchangeRefreshHeroku({
        refreshToken
      });
    case Integrations.GITLAB:
      return exchangeRefreshGitLab({
        refreshToken,
        url
      });
    case Integrations.BITBUCKET:
      return exchangeRefreshBitbucket({
        refreshToken
      });
    case Integrations.GCP_SECRET_MANAGER:
      return exchangeRefreshGCPSecretManager({
        refreshToken,
        metadata
      });
    default:
      throw new Error("Failed to exchange token for incompatible integration");
  }
};
