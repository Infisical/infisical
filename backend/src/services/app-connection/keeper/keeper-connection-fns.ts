import { HttpStatusCode, isAxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { KeeperConnectionMethod } from "./keeper-connection-enums";
import {
  TKeeperCommandResponse,
  TKeeperConnection,
  TKeeperConnectionConfig,
  TKeeperCredentials,
  TKeeperListSharedFoldersRow,
  TKeeperSharedFolder
} from "./keeper-connection-types";

export const KEEPER_UID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Commander parses a positional UID starting with "-" as a flag and Service Mode blocks the "--" separator.
// record-add never generates such a UID, so this only skips records created by other Keeper clients.
export const isAddressableKeeperUid = (uid: string) => KEEPER_UID_PATTERN.test(uid) && !uid.startsWith("-");

export const quoteKeeperArg = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export class KeeperCommandError extends Error {
  statusCode?: number;

  constructor({ message, statusCode }: { message: string; statusCode?: number }) {
    super(message);
    this.name = "KeeperCommandError";
    this.statusCode = statusCode;
  }
}

const redactSensitiveValues = (text: string, sensitiveValues: string[]) =>
  sensitiveValues.filter(Boolean).reduce((redacted, value) => redacted.split(value).join("[REDACTED]"), text);

const getKeeperErrorReason = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;

  const { error, message } = body as TKeeperCommandResponse;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof message === "string" && message.trim()) return message.trim();

  return undefined;
};

export const executeKeeperCommand = async <T = unknown>(
  { apiKey, instanceUrl }: TKeeperCredentials,
  command: string,
  { sensitiveValues = [] }: { sensitiveValues?: string[] } = {}
) => {
  const [commandName] = command.split(" ");

  let response: TKeeperCommandResponse<T>;
  try {
    const { data } = await safeRequest.post<TKeeperCommandResponse<T>>(
      `${removeTrailingSlash(instanceUrl)}/api/v1/executecommand`,
      { command },
      {
        timeout: 30_000,
        headers: {
          "api-key": apiKey,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    response = data;
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (isAxiosError(error) && error.response) {
      logger.error({ error }, "Keeper Commander error");
      const { status } = error.response;
      const reason = getKeeperErrorReason(error.response.data as unknown);

      throw new KeeperCommandError({
        statusCode: status,
        message: reason
          ? `Keeper Commander failed to run '${commandName}' (${status} status): ${redactSensitiveValues(reason, sensitiveValues)}`
          : `Keeper Commander returned ${status} status when running '${commandName}'.`
      });
    }

    const networkErrorCode = isAxiosError(error) && error.code ? ` (${error.code})` : "";

    throw new KeeperCommandError({
      message: `Could not reach Keeper Commander${networkErrorCode}. Verify the instance URL points to a running Commander Service Mode instance.`
    });
  }

  if (response?.status !== "success") {
    const reason = getKeeperErrorReason(response);

    throw new KeeperCommandError({
      message: reason
        ? `Keeper Commander failed to run '${commandName}': ${redactSensitiveValues(reason, sensitiveValues)}`
        : `Keeper Commander did not accept the '${commandName}' command. Verify the API key is allowed to run it.`
    });
  }

  return response.data;
};

export const getKeeperConnectionListItem = () => {
  return {
    name: "Keeper" as const,
    app: AppConnection.Keeper as const,
    methods: Object.values(KeeperConnectionMethod) as [KeeperConnectionMethod.ApiKey]
  };
};

export const validateKeeperConnectionCredentials = async (config: TKeeperConnectionConfig) => {
  try {
    await executeKeeperCommand(config.credentials, "whoami");
  } catch (error: unknown) {
    if (!(error instanceof KeeperCommandError)) {
      throw error;
    }

    if (error.statusCode === HttpStatusCode.Unauthorized || error.statusCode === HttpStatusCode.Forbidden) {
      throw new BadRequestError({
        message: "Unable to validate connection: the Keeper API key was rejected. Verify the key and try again."
      });
    }

    throw new BadRequestError({ message: `Unable to validate connection: ${error.message}` });
  }

  return config.credentials;
};

export const syncDownKeeperVault = (credentials: TKeeperCredentials) => executeKeeperCommand(credentials, "sync-down");

export const listKeeperSharedFolders = async (appConnection: TKeeperConnection): Promise<TKeeperSharedFolder[]> => {
  await syncDownKeeperVault(appConnection.credentials);

  const rows = await executeKeeperCommand<TKeeperListSharedFoldersRow[]>(
    appConnection.credentials,
    "list-sf --format=json"
  );

  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => typeof row?.shared_folder_uid === "string" && isAddressableKeeperUid(row.shared_folder_uid))
    .map((row) => ({ uid: row.shared_folder_uid, name: row.name || row.shared_folder_uid }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
