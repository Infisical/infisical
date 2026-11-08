import type { Knex } from "knex";

import { TableName } from "@app/db/schemas";

import { TKmsKeyProps } from "../model/kms-key";
import { TRootKeyConfigProps } from "../model/root-key-config";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";
import { TKmsWireFormatFixture } from "./kms-wire-format-fixture";

type TRow = Record<string, unknown>;

const keyProps = (fixture: TKmsWireFormatFixture, key: TRow): TKmsKeyProps => {
  const internal = fixture.rows.internalKms.find((row) => row.kmsKeyId === key.id) as TRow | undefined;
  return {
    ...(key as unknown as TKmsKeyProps),
    internal: internal
      ? {
          id: internal.id as string,
          encryptedKey: internal.encryptedKey as Buffer,
          encryptionAlgorithm: internal.encryptionAlgorithm as string,
          version: internal.version as number
        }
      : undefined
  };
};

export const loadFixtureIntoMemory = (fixture: TKmsWireFormatFixture, state: InMemoryKmsCoreState) => {
  const { rows } = fixture;
  const { tables } = state;
  rows.kmsRootConfig.forEach((row) =>
    tables.rootKeyConfigs.set(row.id as string, row as unknown as TRootKeyConfigProps)
  );
  rows.kmsKekHistory.forEach((row) => tables.kekHistory.set(row.id as string, row as never));
  const [legacy] = rows.kmsLegacyEncryptionKeys;
  if (legacy)
    tables.legacyEncryptionKey = {
      id: legacy.id as string,
      encryptedKeySnapshot: legacy.encryptedKeySnapshot as Buffer
    };
  rows.kmsKeys.forEach((key) => tables.kmsKeys.set(key.id as string, keyProps(fixture, key)));
  tables.kmsKeyVersions = rows.internalKmsKeyVersions.map((row) => ({
    id: row.id as string,
    internalKmsId: row.internalKmsId as string,
    encryptedKey: row.encryptedKey as Buffer,
    version: row.version as number
  }));
  tables.orgs.set(rows.organization.id, {
    id: rows.organization.id,
    kmsDefaultKeyId: rows.organization.kmsDefaultKeyId,
    kmsEncryptedDataKey: rows.organization.kmsEncryptedDataKey
  });
  tables.projects.set(rows.project.id, {
    ...rows.project,
    deleteAfter: null,
    kmsCertificateKeyId: null
  });
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
