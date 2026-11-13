import type { Knex } from "knex";

import { TableName } from "@app/db/schemas";

import { KekHistoryEntry, TKekHistoryEntryRecord } from "../models/kek-history-entry";
import { KmsKey, TKmsKeyRecord } from "../models/kms-key";
import { KmsKeyVersion } from "../models/kms-key-version";
import { LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { RootKeyConfig, TRootKeyConfigRecord } from "../models/root-key-config";
import { InMemoryKmsCoreStores } from "./in-memory-kms-core-stores";
import { TKmsWireFormatFixture } from "./kms-wire-format-fixture";

type TRow = Record<string, unknown>;

const keyRecord = (fixture: TKmsWireFormatFixture, key: TRow): TKmsKeyRecord => {
  const internal = fixture.rows.internalKms.find((row) => row.kmsKeyId === key.id) as TRow | undefined;
  return {
    ...(key as unknown as TKmsKeyRecord),
    internal: internal
      ? {
          id: internal.id as string,
          encryptedKey: internal.encryptedKey as Buffer,
          encryptionAlgorithm: internal.encryptionAlgorithm as string,
          version: internal.version as number
        }
      : null,
    external: null
  };
};

export const loadFixtureIntoMemory = async (fixture: TKmsWireFormatFixture, memory: InMemoryKmsCoreStores) => {
  const { rows } = fixture;
  for (const row of rows.kmsRootConfig) {
    // eslint-disable-next-line no-await-in-loop
    await memory.rootKeyConfigStore.insert(RootKeyConfig.restore(row as unknown as TRootKeyConfigRecord));
  }
  for (const row of rows.kmsKekHistory) {
    // eslint-disable-next-line no-await-in-loop
    await memory.kekHistoryStore.insert(KekHistoryEntry.restore(row as unknown as TKekHistoryEntryRecord));
  }
  const [legacy] = rows.kmsLegacyEncryptionKeys;
  if (legacy) {
    await memory.legacyEncryptionKeyStore.insert(
      LegacyEncryptionKey.restore({
        id: legacy.id as string,
        encryptedKeySnapshot: legacy.encryptedKeySnapshot as Buffer
      })
    );
  }
  memory.platformRows.orgs.set(rows.organization.id, {
    id: rows.organization.id,
    kmsDefaultKeyId: rows.organization.kmsDefaultKeyId,
    kmsEncryptedDataKey: rows.organization.kmsEncryptedDataKey
  });
  memory.platformRows.projects.set(rows.project.id, {
    ...rows.project,
    deleteAfter: null,
    kmsCertificateKeyId: null
  });
  for (const key of rows.kmsKeys) {
    // eslint-disable-next-line no-await-in-loop
    await memory.kmsKeyStore.insert(KmsKey.restore(keyRecord(fixture, key)));
  }
  for (const row of rows.internalKmsKeyVersions) {
    // eslint-disable-next-line no-await-in-loop
    await memory.kmsKeyVersionStore.insert(
      KmsKeyVersion.restore({
        id: row.id as string,
        internalKmsId: row.internalKmsId as string,
        encryptedKey: row.encryptedKey as Buffer,
        version: row.version as number
      })
    );
  }
};

// Expects an empty instance (a fresh database): the root config is instance-wide.
export const loadFixtureIntoPostgres = async (fixture: TKmsWireFormatFixture, db: Knex) => {
  const { rows } = fixture;
  await db(TableName.KmsServerRootConfig).delete();
  await db(TableName.KmsKekHistory).delete();
  await db(TableName.KmsLegacyEncryptionKey).delete();
  await db(TableName.KmsServerRootConfig).insert(rows.kmsRootConfig as never);
  await db(TableName.KmsKekHistory).insert(rows.kmsKekHistory as never);
  await db(TableName.KmsLegacyEncryptionKey).insert(rows.kmsLegacyEncryptionKeys as never);
  const suffix = rows.organization.id.slice(0, 8);
  await db(TableName.Organization).insert({
    id: rows.organization.id,
    name: `fixture-${suffix}`,
    slug: `fixture-${suffix}`
  } as never);
  await db(TableName.Project).insert({
    id: rows.project.id,
    orgId: rows.organization.id,
    name: `fixture-${suffix}`,
    slug: `fixture-${suffix}`,
    type: "secret-manager"
  } as never);
  await db(TableName.KmsKey).insert(rows.kmsKeys as never);
  await db(TableName.InternalKms).insert(rows.internalKms as never);
  await db(TableName.InternalKmsKeyVersion).insert(rows.internalKmsKeyVersions as never);
  await db(TableName.Organization)
    .where({ id: rows.organization.id })
    .update({
      kmsDefaultKeyId: rows.organization.kmsDefaultKeyId,
      kmsEncryptedDataKey: rows.organization.kmsEncryptedDataKey
    } as never);
  await db(TableName.Project)
    .where({ id: rows.project.id })
    .update({
      kmsSecretManagerKeyId: rows.project.kmsSecretManagerKeyId,
      kmsSecretManagerEncryptedDataKey: rows.project.kmsSecretManagerEncryptedDataKey
    } as never);
};
