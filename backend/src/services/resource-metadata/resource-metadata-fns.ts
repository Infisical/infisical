import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { unique } from "@app/lib/fn";

import { TResourceMetadataDALFactory } from "./resource-metadata-dal";
import {
  SecretMetadataSearchLogicalOperator,
  TResolvedSecretMetadata,
  TSecretMetadataSearchFilter
} from "./resource-metadata-types";

type TResourceMetadataDAL = Pick<TResourceMetadataDALFactory, "find" | "insertMany">;

export const copyMetadataFromRequestToCertificate = async (
  resourceMetadataDAL: TResourceMetadataDAL,
  {
    certificateRequestId,
    certificateId,
    tx
  }: {
    certificateRequestId: string;
    certificateId: string;
    tx?: Knex;
  }
) => {
  const certRequestMetadata = await resourceMetadataDAL.find({ certificateRequestId });
  if (certRequestMetadata.length > 0) {
    await resourceMetadataDAL.insertMany(
      certRequestMetadata.map(({ key, value, orgId }) => ({
        key,
        value: value || "",
        certificateId,
        orgId
      })),
      tx
    );
  }
};

export const insertMetadataForCertificate = async (
  resourceMetadataDAL: TResourceMetadataDAL,
  {
    metadata,
    certificateId,
    orgId,
    tx
  }: {
    metadata: Array<{ key: string; value: string }>;
    certificateId: string;
    orgId: string;
    tx?: Knex;
  }
) => {
  if (metadata.length > 0) {
    await resourceMetadataDAL.insertMany(
      metadata.map(({ key, value }) => ({
        key,
        value,
        certificateId,
        orgId
      })),
      tx
    );
  }
};

export const insertMetadataForCertificateRequest = async (
  resourceMetadataDAL: TResourceMetadataDAL,
  {
    metadata,
    certificateRequestId,
    certificateRequestCreatedAt,
    orgId,
    tx
  }: {
    metadata: Array<{ key: string; value: string }>;
    certificateRequestId: string;
    certificateRequestCreatedAt: Date;
    orgId: string;
    tx?: Knex;
  }
) => {
  if (metadata.length > 0) {
    await resourceMetadataDAL.insertMany(
      metadata.map(({ key, value }) => ({
        key,
        value,
        certificateRequestId,
        certificateRequestCreatedAt,
        orgId
      })),
      tx
    );
  }
};

export const copyMetadataFromCertificate = async (
  resourceMetadataDAL: TResourceMetadataDAL,
  {
    sourceCertificateId,
    targetCertificateId,
    targetCertificateRequestId,
    targetCertificateRequestCreatedAt,
    orgId,
    tx
  }: {
    sourceCertificateId: string;
    targetCertificateId?: string;
    targetCertificateRequestId?: string;
    targetCertificateRequestCreatedAt?: Date;
    orgId: string;
    tx?: Knex;
  }
) => {
  const originalMetadata = await resourceMetadataDAL.find({ certificateId: sourceCertificateId });
  if (originalMetadata.length === 0) return;

  if (targetCertificateId) {
    await resourceMetadataDAL.insertMany(
      originalMetadata.map(({ key, value }) => ({
        key,
        value: value || "",
        certificateId: targetCertificateId,
        orgId
      })),
      tx
    );
  }

  if (targetCertificateRequestId && targetCertificateRequestCreatedAt) {
    await resourceMetadataDAL.insertMany(
      originalMetadata.map(({ key, value }) => ({
        key,
        value: value || "",
        certificateRequestId: targetCertificateRequestId,
        certificateRequestCreatedAt: targetCertificateRequestCreatedAt,
        orgId
      })),
      tx
    );
  }
};

export const applyMetadataFilter = <T extends Knex.QueryBuilder>(
  query: T,
  metadataFilter: Array<{ key: string; value?: string }>,
  joinColumn: "certificateId" | "certificateRequestId" | "pamResourceId" | "pamAccountId",
  parentTable: TableName
): T => {
  return query.where((qb) => {
    metadataFilter.forEach((meta) => {
      void qb.whereExists((subQuery) => {
        void subQuery
          .select(joinColumn)
          .from(TableName.ResourceMetadata)
          .whereRaw(`??.?? = ??.??`, [TableName.ResourceMetadata, joinColumn, parentTable, "id"])
          .where(`${TableName.ResourceMetadata}.key`, meta.key);
        if (meta.value !== undefined) {
          void subQuery.where(`${TableName.ResourceMetadata}.value`, meta.value);
        }
      });
    });
  }) as T;
};

export const dedupeMetadata = (metadata: TResolvedSecretMetadata[]): TResolvedSecretMetadata[] =>
  unique(metadata, (entry) => JSON.stringify([entry.key, entry.value]));

// Evaluates the and/or search conditions against a secret's already-resolved metadata entries (plaintext
// values + decrypted encrypted values). This is the in-app value match: encrypted metadata is stored as
// non-deterministic KMS ciphertext and cannot be equality-matched in SQL, so the DB only bounds candidates
// by key and the exact value comparison happens here.
//   - or  -> the secret matches if any condition matches one of its entries
//   - and -> the secret matches only if every condition matches some entry (each condition may be satisfied
//            by a different entry, so a secret can match across mixed plaintext + encrypted metadata)
// Returns the subset of entries that satisfied at least one condition, de-duplicated by key/value, to mirror
// the "matched metadata" surfaced by the plaintext DAL search.
export const matchesSecretMetadataFilters = (
  operator: SecretMetadataSearchLogicalOperator,
  filters: TSecretMetadataSearchFilter[],
  metadata: TResolvedSecretMetadata[]
): { matched: boolean; matchedMetadata: TResolvedSecretMetadata[] } => {
  const perFilterMatches = filters.map((filter) =>
    metadata.filter((entry) => entry.key === filter.key && entry.value === filter.value)
  );

  const matched =
    operator === SecretMetadataSearchLogicalOperator.And
      ? perFilterMatches.every((entries) => entries.length > 0)
      : perFilterMatches.some((entries) => entries.length > 0);

  if (!matched) return { matched: false, matchedMetadata: [] };

  return { matched: true, matchedMetadata: dedupeMetadata(perFilterMatches.flat()) };
};
