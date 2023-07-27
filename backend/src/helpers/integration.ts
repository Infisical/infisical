import { Types } from "mongoose";
import { Bot, Integration, IntegrationAuth } from "../models";
import { exchangeCode, exchangeRefresh, syncSecrets } from "../integrations";
import { BotService } from "../services";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  INTEGRATION_NETLIFY,
  INTEGRATION_VERCEL,
} from "../variables";
import { UnauthorizedRequestError } from "../utils/errors";
import * as Sentry from "@sentry/node";

interface Update {
  workspace: string;
  integration: string;
  teamId?: string;
  accountId?: string;
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
}: {
  workspaceId: string;
  integration: string;
  code: string;
  environment: string;
}) => {
  const bot = await Bot.findOne({
    workspace: workspaceId,
    isActive: true,
  });

  if (!bot)
    throw new Error("Bot must be enabled for OAuth2 code-token exchange");

  // exchange code for access and refresh tokens
  const res = await exchangeCode({
    integration,
    code,
  });

  const update: Update = {
    workspace: workspaceId,
    integration,
  };

  switch (integration) {
    case INTEGRATION_VERCEL:
      update.teamId = res.teamId;
      break;
    case INTEGRATION_NETLIFY:
      update.accountId = res.accountId;
      break;
  }

  const integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      workspace: workspaceId,
      integration,
    },
    update,
    {
      new: true,
      upsert: true,
    }
  );

  if (res.refreshToken) {
    // case: refresh token returned from exchange
    // set integration auth refresh token
    await setIntegrationAuthRefreshHelper({
      integrationAuthId: integrationAuth._id.toString(),
      refreshToken: res.refreshToken,
    });
  }

  if (res.accessToken) {
    // case: access token returned from exchange
    // set integration auth access token
    await setIntegrationAuthAccessHelper({
      integrationAuthId: integrationAuth._id.toString(),
      accessId: null,
      accessToken: res.accessToken,
      accessExpiresAt: res.accessExpiresAt,
    });
  }

  return integrationAuth;
};
/**
 * Sync/push environment variables in workspace with id [workspaceId] to
 * all active integrations for that workspace
 * @param {Object} obj
 * @param {Object} obj.workspaceId - id of workspace
 */
export const syncIntegrationsHelper = async ({
  workspaceId,
  environment,
}: {
  workspaceId: Types.ObjectId;
  environment?: string;
}) => {
  try {
    const integrations = await Integration.find({
      workspace: workspaceId,
      ...(environment
        ? {
          environment,
        }
      : {}),
      isActive: true,
      app: { $ne: null },
    });

    // for each workspace integration, sync/push secrets
    // to that integration
    for await (const integration of integrations) {
      // get workspace, environment (shared) secrets
      const secrets = await BotService.getSecrets({
        workspaceId: integration.workspace,
        environment: integration.environment,
        secretPath: integration.secretPath,
      });

      // get workspace, environment (shared) secrets comments
      const secretComments = await BotService.getSecretComments({
        workspaceId: integration.workspace,
        environment: integration.environment,
        secretPath: integration.secretPath,
      })

      const integrationAuth = await IntegrationAuth.findById(
        integration.integrationAuth
      );

      if (!integrationAuth) throw new Error("Failed to find integration auth");
      
      // get integration auth access token
      const access = await getIntegrationAuthAccessHelper({
        integrationAuthId: integration.integrationAuth,
      });

      // sync secrets to integration
      await syncSecrets({
        integration,
        integrationAuth,
        secrets,
        accessId: access.accessId === undefined ? null : access.accessId,
        accessToken: access.accessToken,
        secretComments
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.log(`syncIntegrationsHelper: failed with [workspaceId=${workspaceId}] [environment=${environment}]`, err) // eslint-disable-line no-use-before-define
    throw err
  }
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
  integrationAuthId,
}: {
  integrationAuthId: Types.ObjectId;
}) => {
  const integrationAuth = await IntegrationAuth.findById(
    integrationAuthId
  ).select("+refreshCiphertext +refreshIV +refreshTag");

  if (!integrationAuth)
    throw UnauthorizedRequestError({
      message: "Failed to locate Integration Authentication credentials",
    });

  const refreshToken = await BotService.decryptSymmetric({
    workspaceId: integrationAuth.workspace,
    ciphertext: integrationAuth.refreshCiphertext as string,
    iv: integrationAuth.refreshIV as string,
    tag: integrationAuth.refreshTag as string,
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
  integrationAuthId,
}: {
  integrationAuthId: Types.ObjectId;
}) => {
  let accessId;
  let accessToken;
  const integrationAuth = await IntegrationAuth.findById(
    integrationAuthId
  ).select(
    "workspace integration +accessCiphertext +accessIV +accessTag +accessExpiresAt + refreshCiphertext +accessIdCiphertext +accessIdIV +accessIdTag"
  );

  if (!integrationAuth)
    throw UnauthorizedRequestError({
      message: "Failed to locate Integration Authentication credentials",
    });

  accessToken = await BotService.decryptSymmetric({
    workspaceId: integrationAuth.workspace,
    ciphertext: integrationAuth.accessCiphertext as string,
    iv: integrationAuth.accessIV as string,
    tag: integrationAuth.accessTag as string,
  });

  if (integrationAuth?.accessExpiresAt && integrationAuth?.refreshCiphertext) {
    // there is a access token expiration date
    // and refresh token to exchange with the OAuth2 server

    if (integrationAuth.accessExpiresAt < new Date()) {
      // access token is expired
      const refreshToken = await getIntegrationAuthRefreshHelper({
        integrationAuthId,
      });
      accessToken = await exchangeRefresh({
        integrationAuth,
        refreshToken,
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
      tag: integrationAuth.accessIdTag as string,
    });
  }

  return {
    accessId,
    accessToken,
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
  refreshToken,
}: {
  integrationAuthId: string;
  refreshToken: string;
}) => {
  let integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth) throw new Error("Failed to find integration auth");

  const obj = await BotService.encryptSymmetric({
    workspaceId: integrationAuth.workspace,
    plaintext: refreshToken,
  });

  integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      _id: integrationAuthId,
    },
    {
      refreshCiphertext: obj.ciphertext,
      refreshIV: obj.iv,
      refreshTag: obj.tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8,
    },
    {
      new: true,
    }
  );

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
  accessExpiresAt,
}: {
  integrationAuthId: string;
  accessId: string | null;
  accessToken: string;
  accessExpiresAt: Date | undefined;
}) => {
  let integrationAuth = await IntegrationAuth.findById(integrationAuthId);

  if (!integrationAuth) throw new Error("Failed to find integration auth");

  const encryptedAccessTokenObj = await BotService.encryptSymmetric({
    workspaceId: integrationAuth.workspace,
    plaintext: accessToken,
  });

  let encryptedAccessIdObj;
  if (accessId) {
    encryptedAccessIdObj = await BotService.encryptSymmetric({
      workspaceId: integrationAuth.workspace,
      plaintext: accessId,
    });
  }

  integrationAuth = await IntegrationAuth.findOneAndUpdate(
    {
      _id: integrationAuthId,
    },
    {
      accessIdCiphertext: encryptedAccessIdObj?.ciphertext ?? undefined,
      accessIdIV: encryptedAccessIdObj?.iv ?? undefined,
      accessIdTag: encryptedAccessIdObj?.tag ?? undefined,
      accessCiphertext: encryptedAccessTokenObj.ciphertext,
      accessIV: encryptedAccessTokenObj.iv,
      accessTag: encryptedAccessTokenObj.tag,
      accessExpiresAt,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8,
    },
    {
      new: true,
    }
  );

  return integrationAuth;
};
