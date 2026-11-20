import { AxiosError, HttpStatusCode } from "axios";

import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  GitLabAccessTokenType,
  GitLabConnectionMethod
} from "@app/services/app-connection/gitlab/gitlab-connection-enums";
import {
  getGitLabAuthHeaders,
  getGitLabConnectionAccessToken,
  getGitLabErrorMessage,
  getGitLabInstanceUrl
} from "@app/services/app-connection/gitlab/gitlab-connection-fns";
import { TGitLabConnection } from "@app/services/app-connection/gitlab/gitlab-connection-types";

import { GITLAB_TOKEN_EXPIRY_PADDING_DAYS } from "./gitlab-token-rotation-constants";
import {
  TGitLabCreateTokenResponse,
  TGitLabTokenApiContext,
  TGitLabTokenCredentials
} from "./gitlab-token-rotation-types";

/** The token's expiry date (YYYY-MM-DD, UTC): two rotation intervals plus padding from today. */
export const getGitLabTokenExpiresAt = (rotationInterval: number, now = new Date()) => {
  const expiresAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  expiresAt.setUTCDate(expiresAt.getUTCDate() + rotationInterval * 2 + GITLAB_TOKEN_EXPIRY_PADDING_DAYS);

  return expiresAt.toISOString().slice(0, 10);
};

/**
 * GitLab refuses token creation to group and project access tokens, so only a personal access token
 * (which is what a service account's own token is) or OAuth can back a token rotation.
 */
export const assertGitLabConnectionCanCreateTokens = (connection: TGitLabConnection) => {
  if (
    connection.method === GitLabConnectionMethod.AccessToken &&
    connection.credentials.accessTokenType !== GitLabAccessTokenType.Personal
  ) {
    throw new BadRequestError({
      message: `GitLab ${connection.credentials.accessTokenType} access tokens cannot create other tokens. Use a GitLab connection with a personal access token or OAuth.`
    });
  }
};

export const getGitLabTokenApiContext = async ({
  connection,
  appConnectionDAL,
  kmsDataKeyService
}: {
  connection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
}): Promise<TGitLabTokenApiContext> => {
  const accessToken = await getGitLabConnectionAccessToken(connection, appConnectionDAL, kmsDataKeyService);
  const instanceUrl = await getGitLabInstanceUrl(connection.credentials.instanceUrl);

  return {
    apiUrl: `${instanceUrl}/api/v4`,
    headers: getGitLabAuthHeaders(connection.method, accessToken)
  };
};

// GitLab answers some permission refusals with a 400, e.g. "User does not have permission to create group access token"
const isGitLabPermissionError = (error: unknown) =>
  error instanceof AxiosError &&
  (error.response?.status === HttpStatusCode.Forbidden ||
    (error.response?.status === HttpStatusCode.BadRequest && /permission/i.test(getGitLabErrorMessage(error))));

const formatGitLabTokenError = (action: string, error: unknown, permissionHint: string) =>
  `${action}. GitLab responded: "${getGitLabErrorMessage(error)}".${isGitLabPermissionError(error) ? ` ${permissionHint}` : ""}`;

/**
 * Creates a token under `tokensPath`, a GitLab token collection such as
 * `/groups/:id/service_accounts/:user_id/personal_access_tokens` or `/groups/:id/access_tokens`.
 */
export const createGitLabToken = async ({
  context,
  tokensPath,
  name,
  description,
  scopes,
  accessLevel,
  rotationInterval,
  resourceLabel,
  permissionHint
}: {
  context: TGitLabTokenApiContext;
  tokensPath: string;
  /** a timestamp is appended so each rotated token is distinct */
  name: string;
  description?: string;
  scopes: string[];
  /** the role of a group or project access token; personal access tokens have none */
  accessLevel?: number;
  rotationInterval: number;
  /** what the token belongs to, for error messages, e.g. `service account '12' in group '34'` */
  resourceLabel: string;
  /** appended when GitLab refuses for lack of permission */
  permissionHint: string;
}): Promise<TGitLabTokenCredentials> => {
  try {
    const { data } = await safeRequest.post<TGitLabCreateTokenResponse>(
      `${context.apiUrl}${tokensPath}`,
      {
        name: `${name}-${Date.now()}`,
        ...(description ? { description } : {}),
        scopes,
        ...(accessLevel ? { access_level: accessLevel } : {}),
        expires_at: getGitLabTokenExpiresAt(rotationInterval)
      },
      {
        headers: { ...context.headers, "Content-Type": "application/json" },
        // a retried create whose first response was lost would mint a second token that nothing tracks
        "axios-retry": { retries: 0 }
      }
    );

    if (!data?.id || !data?.token) {
      throw new BadRequestError({ message: `GitLab did not return a token for ${resourceLabel}` });
    }

    return { tokenId: data.id.toString(), token: data.token };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: formatGitLabTokenError(`Failed to create a GitLab token for ${resourceLabel}`, error, permissionHint)
    });
  }
};

/**
 * Rotates a token in place: GitLab revokes it and issues the replacement to the same user, so a group
 * access token keeps its bot user. Returns null when GitLab no longer has the token (revoked, expired or
 * deleted). Rotating a token that was already revoked also makes GitLab revoke every active token rotated
 * from it, including one someone rotated outside Infisical.
 */
export const rotateGitLabToken = async ({
  context,
  tokensPath,
  tokenId,
  rotationInterval,
  resourceLabel,
  permissionHint
}: {
  context: TGitLabTokenApiContext;
  tokensPath: string;
  tokenId: string;
  rotationInterval: number;
  resourceLabel: string;
  permissionHint: string;
}): Promise<TGitLabTokenCredentials | null> => {
  try {
    const { data } = await safeRequest.post<TGitLabCreateTokenResponse>(
      `${context.apiUrl}${tokensPath}/${encodeURIComponent(tokenId)}/rotate`,
      { expires_at: getGitLabTokenExpiresAt(rotationInterval) },
      {
        headers: { ...context.headers, "Content-Type": "application/json" },
        // a retried rotate whose first response was lost would find the token revoked and revoke its replacement
        "axios-retry": { retries: 0 }
      }
    );

    if (!data?.id || !data?.token) {
      throw new BadRequestError({ message: `GitLab did not return a rotated token for ${resourceLabel}` });
    }

    return { tokenId: data.id.toString(), token: data.token };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    if (
      error instanceof AxiosError &&
      (error.response?.status === HttpStatusCode.Unauthorized || error.response?.status === HttpStatusCode.NotFound)
    ) {
      return null;
    }

    throw new BadRequestError({
      message: formatGitLabTokenError(
        `Failed to rotate GitLab token '${tokenId}' of ${resourceLabel}`,
        error,
        permissionHint
      )
    });
  }
};

export const revokeGitLabToken = async ({
  context,
  tokensPath,
  tokenId,
  resourceLabel,
  permissionHint
}: {
  context: TGitLabTokenApiContext;
  tokensPath: string;
  tokenId: string;
  resourceLabel: string;
  permissionHint: string;
}) => {
  try {
    await safeRequest.delete(`${context.apiUrl}${tokensPath}/${encodeURIComponent(tokenId)}`, {
      headers: context.headers
    });
  } catch (error: unknown) {
    // already revoked or deleted, which is the end state revocation wants
    if (error instanceof AxiosError && error.response?.status === HttpStatusCode.NotFound) return;

    throw new BadRequestError({
      message: formatGitLabTokenError(
        `Failed to revoke GitLab token '${tokenId}' of ${resourceLabel}`,
        error,
        permissionHint
      )
    });
  }
};

/** Checks a generated token by introspecting it with itself, since the connection's token can't. */
export const verifyGitLabToken = async ({ instanceUrl, token }: { instanceUrl?: string; token: string }) => {
  const gitLabInstanceUrl = await getGitLabInstanceUrl(instanceUrl);

  try {
    const { data } = await safeRequest.get<{ active?: boolean; revoked?: boolean }>(
      `${gitLabInstanceUrl}/api/v4/personal_access_tokens/self`,
      { headers: { "PRIVATE-TOKEN": token } }
    );

    if (data?.active === false || data?.revoked) {
      throw new BadRequestError({ message: "The GitLab token is no longer active" });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({ message: `Failed to verify the GitLab token: ${getGitLabErrorMessage(error)}` });
  }
};
