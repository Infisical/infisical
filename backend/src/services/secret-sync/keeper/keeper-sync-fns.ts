/* eslint-disable no-await-in-loop */
import { logger } from "@app/lib/logger";
import {
  executeKeeperCommand,
  isAddressableKeeperUid,
  KEEPER_UID_PATTERN,
  quoteKeeperArg,
  TKeeperCredentials
} from "@app/services/app-connection/keeper";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  TKeeperListResponse,
  TKeeperLoginRecord,
  TKeeperRecord,
  TKeeperSyncWithCredentials
} from "./keeper-sync-types";

const KEEPER_LOGIN_RECORD_TYPE = "login";
const KEEPER_VARIABLE_EXPANSION_TOKEN = "${";

const getListedRecordUids = (listing: TKeeperListResponse | undefined) => {
  const entries = Array.isArray(listing)
    ? listing.filter((entry) => entry?.type === "record")
    : (listing?.records ?? []);

  return entries
    .map((entry) => entry?.uid ?? entry?.record_uid)
    .filter((uid): uid is string => typeof uid === "string" && KEEPER_UID_PATTERN.test(uid));
};

const getPasswordValue = (record: TKeeperRecord) => {
  const [value] = record.fields?.find((field) => field?.type === "password")?.value ?? [];
  return typeof value === "string" ? value : "";
};

const listKeeperLoginRecords = async (credentials: TKeeperCredentials, folderUid: string) => {
  if (!isAddressableKeeperUid(folderUid)) {
    throw new SecretSyncError({
      shouldRetry: false,
      message: `Keeper shared folder UID '${folderUid}' cannot be addressed through Keeper Commander Service Mode. Choose a different shared folder.`
    });
  }

  const listing = await executeKeeperCommand<TKeeperListResponse>(credentials, `ls --format=json ${folderUid}`);

  const listedUids = getListedRecordUids(listing);
  const unaddressableUids = listedUids.filter((uid) => !isAddressableKeeperUid(uid));
  if (unaddressableUids.length) {
    logger.warn(
      `Skipping Keeper records whose UID starts with '-', which Service Mode cannot address [folderUid=${folderUid}] [recordUids=${unaddressableUids.join(",")}]`
    );
  }

  const records = new Map<string, TKeeperLoginRecord>();
  const duplicates: TKeeperLoginRecord[] = [];

  for (const uid of listedUids.filter(isAddressableKeeperUid)) {
    const record = await executeKeeperCommand<TKeeperRecord>(credentials, `get --format=json ${uid}`);

    if (record?.type !== KEEPER_LOGIN_RECORD_TYPE || typeof record.title !== "string") {
      // eslint-disable-next-line no-continue
      continue;
    }

    const loginRecord = { uid, title: record.title, value: getPasswordValue(record) };

    if (records.has(loginRecord.title)) {
      duplicates.push(loginRecord);
    } else {
      records.set(loginRecord.title, loginRecord);
    }
  }

  return { records, duplicates };
};

const getPasswordFieldArg = (value: string) => {
  const encodedValue = Buffer.from(value, "utf8").toString("base64");

  return {
    arg: quoteKeeperArg(`password=$BASE64:${encodedValue}`),
    sensitiveValues: [value, encodedValue]
  };
};

const createKeeperLoginRecord = (credentials: TKeeperCredentials, folderUid: string, title: string, value: string) => {
  const { arg, sensitiveValues } = getPasswordFieldArg(value);

  return executeKeeperCommand(
    credentials,
    `record-add -f --folder=${folderUid} --record-type=${KEEPER_LOGIN_RECORD_TYPE} --title=${quoteKeeperArg(title)} ${arg}`,
    { sensitiveValues }
  );
};

const updateKeeperLoginRecordValue = (credentials: TKeeperCredentials, recordUid: string, value: string) => {
  const { arg, sensitiveValues } = getPasswordFieldArg(value);

  return executeKeeperCommand(credentials, `record-update -f --record=${recordUid} ${arg}`, {
    sensitiveValues
  });
};

const deleteKeeperRecord = (credentials: TKeeperCredentials, recordUid: string) =>
  executeKeeperCommand(credentials, `rm -f --purge ${recordUid}`);

export const KeeperSyncFns = {
  async syncSecrets(secretSync: TKeeperSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const {
      connection,
      environment,
      destinationConfig: { folderUid },
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const unsupportedKeys = Object.keys(secretMap).filter((key) => key.includes(KEEPER_VARIABLE_EXPANSION_TOKEN));
    if (unsupportedKeys.length) {
      throw new SecretSyncError({
        secretKey: unsupportedKeys[0],
        shouldRetry: false,
        message: `${unsupportedKeys.length} secret ${
          unsupportedKeys.length === 1 ? "key contains" : "keys contain"
        } "${KEEPER_VARIABLE_EXPANSION_TOKEN}", which Keeper Commander expands as a variable in record titles: ${unsupportedKeys.join(
          ", "
        )}. Rename the ${unsupportedKeys.length === 1 ? "secret" : "secrets"} or adjust the key schema.`
      });
    }

    const { records, duplicates } = await listKeeperLoginRecords(connection.credentials, folderUid);

    for (const [key, { value }] of Object.entries(secretMap)) {
      const existing = records.get(key);

      try {
        if (!existing) {
          await createKeeperLoginRecord(connection.credentials, folderUid, key, value);
        } else if (existing.value !== value) {
          await updateKeeperLoginRecordValue(connection.credentials, existing.uid, value);
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    const staleRecords = [
      ...duplicates,
      ...Array.from(records.values()).filter((record) => !Object.hasOwn(secretMap, record.title))
    ];

    for (const record of staleRecords) {
      if (!matchesSchema(record.title, environment?.slug || "", keySchema)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        await deleteKeeperRecord(connection.credentials, record.uid);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: record.title });
      }
    }
  },

  async getSecrets(secretSync: TKeeperSyncWithCredentials): Promise<TSecretMap> {
    const { records } = await listKeeperLoginRecords(
      secretSync.connection.credentials,
      secretSync.destinationConfig.folderUid
    );

    return Object.fromEntries(Array.from(records.values()).map((record) => [record.title, { value: record.value }]));
  },

  async removeSecrets(secretSync: TKeeperSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const {
      connection,
      destinationConfig: { folderUid }
    } = secretSync;

    const { records, duplicates } = await listKeeperLoginRecords(connection.credentials, folderUid);

    for (const record of [...records.values(), ...duplicates]) {
      if (!Object.hasOwn(secretMap, record.title)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        await deleteKeeperRecord(connection.credentials, record.uid);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: record.title });
      }
    }
  }
};
