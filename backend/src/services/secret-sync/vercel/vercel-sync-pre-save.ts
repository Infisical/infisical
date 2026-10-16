import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TVercelConnection } from "@app/services/app-connection/vercel/vercel-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TPreSaveTransformDestinationConfigFn } from "../secret-sync-types";
import { VercelSyncScope } from "./vercel-sync-enums";

/**
 * Checks access to Vercel shared environment variables before saving a Team sync.
 * A project-scoped token may create a connection but not access team resources,
 * so we verify access for Team syncs. Project destinations skip this check.
 *
 * The check runs when creating a Team sync or changing its connection, team, or
 * scope. If the connection, team, and scope are unchanged, the check is skipped
 * so routine edits can still save when Vercel is unavailable.
 *
 * This only confirms read access; the sync worker fetches the variables later.
 * Invalid credentials, inaccessible team resources, and temporary Vercel issues
 * return separate error messages.
 *
 * @returns The submitted configuration unchanged. If no configuration is
 * submitted, returns `undefined` so the saved destination is preserved.
 * @throws {NotFoundError} If the connection is missing or is not Vercel.
 * @throws {BadRequestError} If the team ID is missing or the access check fails.
 */
export const vercelPreSaveTransformDestinationConfig: TPreSaveTransformDestinationConfigFn = async (
  { destinationConfig, existingDestinationConfig, connectionId, existingConnectionId },
  { appConnectionDAL, kmsService }
) => {
  const config = destinationConfig ?? existingDestinationConfig;
  if (config?.scope !== VercelSyncScope.Team) return destinationConfig;
  if (typeof config.teamId !== "string" || !config.teamId) {
    throw new BadRequestError({ message: "A Vercel team ID is required for a Team sync." });
  }

  if (
    connectionId === existingConnectionId &&
    existingDestinationConfig?.scope === VercelSyncScope.Team &&
    config.teamId === existingDestinationConfig.teamId
  ) {
    return destinationConfig;
  }

  const connection = await appConnectionDAL.findById(connectionId);
  if (!connection || connection.app !== AppConnection.Vercel) {
    throw new NotFoundError({ message: `Could not find Vercel connection with ID '${connectionId}'.` });
  }

  const credentials = await decryptAppConnectionCredentials({
    orgId: connection.orgId,
    projectId: connection.projectId,
    encryptedCredentials: connection.encryptedCredentials,
    kmsService
  });
  const { apiToken } = credentials as TVercelConnection["credentials"];

  try {
    await request.get(`${IntegrationUrls.VERCEL_API_URL}/v1/env`, {
      params: { teamId: config.teamId },
      headers: { Authorization: `Bearer ${apiToken}` }
    });
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      throw new BadRequestError({
        message: "Vercel rejected the API token. Update the connection with a valid token and try again."
      });
    }
    if (isAxiosError(error) && (error.response?.status === 403 || error.response?.status === 404)) {
      throw new BadRequestError({
        message: `The Vercel API token cannot access shared environment variables for team '${config.teamId}'. Use Project scope for a project-scoped token, or use a token with access to this team's shared environment variables.`
      });
    }
    throw new BadRequestError({
      error,
      message: "Could not verify access to Vercel shared environment variables. Try again later."
    });
  }

  return destinationConfig;
};
