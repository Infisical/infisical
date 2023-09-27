import { Types } from "mongoose";
import { Bot, IIntegrationAuth, IntegrationAuth } from "../models";
import { exchangeCode, exchangeRefresh } from "../integrations";
import { BotService } from "../services";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_NETLIFY,
  INTEGRATION_VERCEL,
} from "../variables";
import { InternalServerError, UnauthorizedRequestError } from "../utils/errors";
import { IntegrationAuthMetadata } from "../models/integrationAuth/types";

interface Update {
  workspace: string;
  integration: string;
  url?: string;
  teamId?: string;
  accountId?: string;
  metadata?: IntegrationAuthMetadata
}

/**
 * Perform OAuth2 code-token exchange for workspace with id [workspaceId] and integration
 * named [integration]
 * - Store integration access and refresh tokens returned from the OAuth2 code-token exchange
 * - Add placeholder inactive integration
 * - Create bot sequence for integration
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.integration - name of integration
 * @param {String} obj.code - code
 * @returns {IntegrationAuth} integrationAuth - integration auth after OAuth2 code-token exchange
 */
export const handleOAuthExchangeHelper = async ({
  workspaceId,
  integration,
  code,
  environment,
  url
}: {
  workspaceId: string;
  integration: string;
  code: string;
  environment: string;
  url?: string;
}) => {
  const bot = await Bot.findOne({
    workspace: workspaceId,
    isActive: true
  });

  if (!bot) throw new Error("Bot must be enabled for OAuth2 code-token exchange");

  // exchange code for access and refresh tokens
  const res = await exchangeCode({
    integration,
    code,
    url
  });

  const update: Update = {
    workspace: workspaceId,
    integration
  };
  
  if (res.url) {
    update.url = res.url;
  }

  switch (integration) {
    case INTEGRATION_VERCEL:
      update.teamId = res.teamId;
      break;
    case INTEGRATION_NETLIFY:
      update.accountId = res.accountId;
      break;
    case INTEGRATION_GCP_SECRET_MANAGER:
      update.metadata = {
        authMethod: "oauth2"
      }
      break;
  }

  const integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      workspace: workspaceId,
      integration
    },
    update,
    {
      new: true,
      upsert: true
    }
  );

  if (res.refreshToken) {
    // case: refresh token returned from exchange
    // set integration auth refresh token
    await setIntegrationAuthRefreshHelper({
      integrationAuthId: integrationAuth._id.toString(),
      refreshToken: res.refreshToken
    });
  }

  if (res.accessToken) {
    // case: access token returned from exchange
    // set integration auth access token
    await setIntegrationAuthAccessHelper({
      integrationAuthId: integrationAuth._id.toString(),
      accessToken: res.accessToken,
      accessExpiresAt: res.accessExpiresAt
    });
  }

  return integrationAuth;
};

/**
 * Return decrypted refresh token using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} refreshToken - decrypted refresh token
 */
export const getIntegrationAuthRefreshHelper = async ({
  integrationAuthId
}: {
  integrationAuthId: Types.ObjectId;
}) => {
  const integrationAuth = await IntegrationAuth.findById(integrationAuthId).select(
    "+refreshCiphertext +refreshIV +refreshTag"
  );

  if (!integrationAuth)
    throw UnauthorizedRequestError({
      message: "Failed to locate Integration Authentication credentials"
    });

  const refreshToken = await BotService.decryptSymmetric({
    workspaceId: integrationAuth.workspace,
    ciphertext: integrationAuth.refreshCiphertext as string,
    iv: integrationAuth.refreshIV as string,
    tag: integrationAuth.refreshTag as string
  });

  return refreshToken;
};

/**
 * Return decrypted access token using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @returns {String} accessToken - decrypted access token
 */
export const getIntegrationAuthAccessHelper = async ({
  integrationAuthId
}: {
  integrationAuthId: Types.ObjectId;
}) => {
  let accessId;
  let accessToken;
  const integrationAuth = await IntegrationAuth.findById(integrationAuthId).select(
    "workspace integration +accessCiphertext +accessIV +accessTag +accessExpiresAt +refreshCiphertext +refreshIV +refreshTag +accessIdCiphertext +accessIdIV +accessIdTag metadata teamId url"
  );

  if (!integrationAuth)
    throw UnauthorizedRequestError({
      message: "Failed to locate Integration Authentication credentials"
    });

  if (integrationAuth.accessCiphertext && integrationAuth.accessIV && integrationAuth.accessTag) {
    accessToken = await BotService.decryptSymmetric({
      workspaceId: integrationAuth.workspace,
      ciphertext: integrationAuth.accessCiphertext as string,
      iv: integrationAuth.accessIV as string,
      tag: integrationAuth.accessTag as string
    });
  }

  if (integrationAuth?.refreshCiphertext) {
    // there is a access token expiration date
    // and refresh token to exchange with the OAuth2 server
    const refreshToken = await getIntegrationAuthRefreshHelper({
      integrationAuthId
    });

    if (integrationAuth?.accessExpiresAt && integrationAuth.accessExpiresAt < new Date()) {
      // access token is expired
      accessToken = await exchangeRefresh({
        integrationAuth,
        refreshToken
      });
    }
  }

  if (
    integrationAuth?.accessIdCiphertext &&
    integrationAuth?.accessIdIV &&
    integrationAuth?.accessIdTag
  ) {
    accessId = await BotService.decryptSymmetric({
      workspaceId: integrationAuth.workspace,
      ciphertext: integrationAuth.accessIdCiphertext as string,
      iv: integrationAuth.accessIdIV as string,
      tag: integrationAuth.accessIdTag as string
    });
  }

  if (!accessToken) throw InternalServerError();

  return {
    integrationAuth,
    accessId,
    accessToken
  };
};

/**
 * Encrypt refresh token [refreshToken] using the bot's copy
 * of the workspace key for workspace belonging to integration auth
 * with id [integrationAuthId] and store it
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} obj.refreshToken - refresh token
 */
export const setIntegrationAuthRefreshHelper = async ({
  integrationAuthId,
  refreshToken
}: {
  integrationAuthId: string;
  refreshToken: string;
}): Promise<IIntegrationAuth> => {
  let integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth) throw new Error("Failed to find integration auth");

  const obj = await BotService.encryptSymmetric({
    workspaceId: integrationAuth.workspace,
    plaintext: refreshToken
  });

  integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      _id: integrationAuthId
    },
    {
      refreshCiphertext: obj.ciphertext,
      refreshIV: obj.iv,
      refreshTag: obj.tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    },
    {
      new: true
    }
  );
  
  if (!integrationAuth) throw InternalServerError();

  return integrationAuth;
};

/**
 * Encrypt access token [accessToken] and (optionally) access id [accessId]
 * using the bot's copy of the workspace key for workspace belonging to
 * integration auth with id [integrationAuthId] and store it along with [accessExpiresAt]
 * @param {Object} obj
 * @param {String} obj.integrationAuthId - id of integration auth
 * @param {String} obj.accessToken - access token
 * @param {Date} obj.accessExpiresAt - expiration date of access token
 */
export const setIntegrationAuthAccessHelper = async ({
  integrationAuthId,
  accessId,
  accessToken,
  accessExpiresAt
}: {
  integrationAuthId: string;
  accessId?: string;
  accessToken?: string;
  accessExpiresAt: Date | undefined;
}) => {
  let integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth) throw new Error("Failed to find integration auth");
  
  let encryptedAccessTokenObj;
  let encryptedAccessIdObj;

  if (accessToken) {
    encryptedAccessTokenObj = await BotService.encryptSymmetric({
      workspaceId: integrationAuth.workspace,
      plaintext: accessToken
    });
  }

  if (accessId) {
    encryptedAccessIdObj = await BotService.encryptSymmetric({
      workspaceId: integrationAuth.workspace,
      plaintext: accessId
    });
  }

  integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      _id: integrationAuthId
    },
    {
      accessIdCiphertext: encryptedAccessIdObj?.ciphertext ?? undefined,
      accessIdIV: encryptedAccessIdObj?.iv,
      accessIdTag: encryptedAccessIdObj?.tag,
      accessCiphertext: encryptedAccessTokenObj?.ciphertext,
      accessIV: encryptedAccessTokenObj?.iv,
      accessTag: encryptedAccessTokenObj?.tag,
      accessExpiresAt,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    },
    {
      new: true
    }
  );

  return integrationAuth;
};
