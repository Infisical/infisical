import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

import { TResourceMetadataDALFactory } from "./resource-metadata-dal";

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
  joinColumn: "certificateId" | "certificateRequestId",
  parentTable: TableName
): T => {
  return query.where((qb) => {
    metadataFilter.forEach((meta) => {
      void qb.whereExists((subQuery) => {
        void subQuery
          .select(joinColumn)
          .from(TableName.ResourceMetadata)
          .whereRaw(`"${TableName.ResourceMetadata}"."${joinColumn}" = "${parentTable}"."id"`)
          .where(`${TableName.ResourceMetadata}.key`, meta.key);
        if (meta.value !== undefined) {
          void subQuery.where(`${TableName.ResourceMetadata}.value`, meta.value);
        }
      });
    });
  }) as T;
};
