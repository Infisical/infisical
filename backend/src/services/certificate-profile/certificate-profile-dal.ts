import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import {
  EnrollmentType,
  TCertificateProfile,
  TCertificateProfileCertificate,
  TCertificateProfileInsert,
  TCertificateProfileUpdate,
  TCertificateProfileWithConfigs
} from "./certificate-profile-types";

export type TCertificateProfileDALFactory = ReturnType<typeof certificateProfileDALFactory>;

export const certificateProfileDALFactory = (db: TDbClient) => {
  const certificateProfileOrm = ormify(db, TableName.PkiCertificateProfile);

  const create = async (data: TCertificateProfileInsert, tx?: Knex): Promise<TCertificateProfile> => {
    try {
      const [certificateProfile] = (await (tx || db)(TableName.PkiCertificateProfile).insert(data).returning("*")) as [
        TCertificateProfile
      ];
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create certificate profile" });
    }
  };

  const updateById = async (id: string, data: TCertificateProfileUpdate, tx?: Knex): Promise<TCertificateProfile> => {
    try {
      const [certificateProfile] = (await (tx || db)(TableName.PkiCertificateProfile)
        .where({ id })
        .update(data)
        .returning("*")) as [TCertificateProfile];
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate profile" });
    }
  };

  const deleteById = async (id: string, tx?: Knex): Promise<TCertificateProfile> => {
    try {
      const [certificateProfile] = (await (tx || db)(TableName.PkiCertificateProfile)
        .where({ id })
        .del()
        .returning("*")) as [TCertificateProfile];
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete certificate profile" });
    }
  };

  const findById = async (id: string, tx?: Knex): Promise<TCertificateProfile | undefined> => {
    try {
      const certificateProfile = (await (tx || db)(TableName.PkiCertificateProfile).where({ id }).first()) as
        | TCertificateProfile
        | undefined;
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by id" });
    }
  };

  const findByIdWithConfigs = async (id: string, tx?: Knex): Promise<TCertificateProfileWithConfigs | undefined> => {
    try {
      const query = (tx || db)(TableName.PkiCertificateProfile)
        .leftJoin(
          TableName.CertificateAuthority,
          `${TableName.PkiCertificateProfile}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .leftJoin(
          TableName.PkiCertificateTemplateV2,
          `${TableName.PkiCertificateProfile}.certificateTemplateId`,
          `${TableName.PkiCertificateTemplateV2}.id`
        )
        .leftJoin(
          TableName.PkiEstEnrollmentConfig,
          `${TableName.PkiCertificateProfile}.estConfigId`,
          `${TableName.PkiEstEnrollmentConfig}.id`
        )
        .leftJoin(
          TableName.PkiApiEnrollmentConfig,
          `${TableName.PkiCertificateProfile}.apiConfigId`,
          `${TableName.PkiApiEnrollmentConfig}.id`
        )
        .select(selectAllTableCols(TableName.PkiCertificateProfile))
        .select(
          db.ref("id").withSchema(TableName.CertificateAuthority).as("caId"),
          db.ref("projectId").withSchema(TableName.CertificateAuthority).as("caProjectId"),
          db.ref("status").withSchema(TableName.CertificateAuthority).as("caStatus"),
          db.ref("name").withSchema(TableName.CertificateAuthority).as("caName"),
          db.ref("id").withSchema(TableName.PkiCertificateTemplateV2).as("templateId"),
          db.ref("projectId").withSchema(TableName.PkiCertificateTemplateV2).as("templateProjectId"),
          db.ref("name").withSchema(TableName.PkiCertificateTemplateV2).as("templateName"),
          db.ref("description").withSchema(TableName.PkiCertificateTemplateV2).as("templateDescription"),
          db.ref("id").withSchema(TableName.PkiEstEnrollmentConfig).as("estConfigId"),
          db
            .ref("disableBootstrapCaValidation")
            .withSchema(TableName.PkiEstEnrollmentConfig)
            .as("estConfigDisableBootstrapCaValidation"),
          db.ref("hashedPassphrase").withSchema(TableName.PkiEstEnrollmentConfig).as("estConfigHashedPassphrase"),
          db.ref("encryptedCaChain").withSchema(TableName.PkiEstEnrollmentConfig).as("estConfigEncryptedCaChain"),
          db.ref("id").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigId"),
          db.ref("autoRenew").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigAutoRenew"),
          db.ref("renewBeforeDays").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigRenewBeforeDays")
        )
        .where(`${TableName.PkiCertificateProfile}.id`, id)
        .first();

      const result = await query;

      if (!result) return undefined;

      const estConfig =
        result.estConfigId && result.estConfigHashedPassphrase
          ? ({
              id: result.estConfigId,
              disableBootstrapCaValidation: !!result.estConfigDisableBootstrapCaValidation,
              passphrase: result.estConfigHashedPassphrase,
              caChain: result.estConfigEncryptedCaChain ? result.estConfigEncryptedCaChain.toString("utf8") : ""
            } as TCertificateProfileWithConfigs["estConfig"])
          : undefined;

      const apiConfig = result.apiConfigId
        ? ({
            id: result.apiConfigId,
            autoRenew: !!result.apiConfigAutoRenew,
            renewBeforeDays: result.apiConfigRenewBeforeDays || undefined
          } as TCertificateProfileWithConfigs["apiConfig"])
        : undefined;

      const certificateAuthority =
        result.caId && result.caProjectId && result.caStatus && result.caName
          ? ({
              id: result.caId,
              projectId: result.caProjectId,
              status: result.caStatus,
              name: result.caName
            } as TCertificateProfileWithConfigs["certificateAuthority"])
          : undefined;

      const certificateTemplate =
        result.templateId && result.templateProjectId && result.templateName
          ? ({
              id: result.templateId,
              projectId: result.templateProjectId,
              name: result.templateName,
              description: result.templateDescription || undefined
            } as TCertificateProfileWithConfigs["certificateTemplate"])
          : undefined;

      const transformedResult: TCertificateProfileWithConfigs = {
        id: result.id,
        projectId: result.projectId,
        caId: result.caId,
        certificateTemplateId: result.certificateTemplateId,
        slug: result.slug,
        description: result.description,
        enrollmentType: result.enrollmentType as EnrollmentType,
        estConfigId: result.estConfigId,
        apiConfigId: result.apiConfigId,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        estConfig,
        apiConfig,
        certificateAuthority,
        certificateTemplate
      };

      return transformedResult;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by id with configs" });
    }
  };

  const findBySlugAndProjectId = async (
    slug: string,
    projectId: string,
    tx?: Knex
  ): Promise<TCertificateProfile | undefined> => {
    try {
      const certificateProfile = (await (tx || db)(TableName.PkiCertificateProfile)
        .where({ slug, projectId })
        .first()) as TCertificateProfile | undefined;
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by slug and project id" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    options: {
      offset?: number;
      limit?: number;
      search?: string;
      enrollmentType?: EnrollmentType;
      caId?: string;
    } = {},
    tx?: Knex
  ): Promise<TCertificateProfile[] | TCertificateProfileWithConfigs[]> => {
    try {
      const { offset = 0, limit = 20, search, enrollmentType, caId } = options;

      let baseQuery = (tx || db)(TableName.PkiCertificateProfile).where(
        `${TableName.PkiCertificateProfile}.projectId`,
        projectId
      );

      if (search) {
        baseQuery = baseQuery.where((builder) => {
          void builder.where((qb) => {
            void qb
              .whereILike(`${TableName.PkiCertificateProfile}.slug`, `%${search}%`)
              .orWhereILike(`${TableName.PkiCertificateProfile}.description`, `%${search}%`);
          });
        });
      }

      if (enrollmentType) {
        baseQuery = baseQuery.where(`${TableName.PkiCertificateProfile}.enrollmentType`, enrollmentType);
      }

      if (caId) {
        baseQuery = baseQuery.where(`${TableName.PkiCertificateProfile}.caId`, caId);
      }

      const query = baseQuery
        .leftJoin(
          TableName.PkiEstEnrollmentConfig,
          `${TableName.PkiCertificateProfile}.estConfigId`,
          `${TableName.PkiEstEnrollmentConfig}.id`
        )
        .leftJoin(
          TableName.PkiApiEnrollmentConfig,
          `${TableName.PkiCertificateProfile}.apiConfigId`,
          `${TableName.PkiApiEnrollmentConfig}.id`
        )
        .select(selectAllTableCols(TableName.PkiCertificateProfile))
        .select(
          db.ref("id").withSchema(TableName.PkiEstEnrollmentConfig).as("estId"),
          db
            .ref("disableBootstrapCaValidation")
            .withSchema(TableName.PkiEstEnrollmentConfig)
            .as("estDisableBootstrapCaValidation"),
          db.ref("hashedPassphrase").withSchema(TableName.PkiEstEnrollmentConfig).as("estHashedPassphrase"),
          db.ref("encryptedCaChain").withSchema(TableName.PkiEstEnrollmentConfig).as("estEncryptedCaChain"),
          db.ref("id").withSchema(TableName.PkiApiEnrollmentConfig).as("apiId"),
          db.ref("autoRenew").withSchema(TableName.PkiApiEnrollmentConfig).as("apiAutoRenew"),
          db.ref("renewBeforeDays").withSchema(TableName.PkiApiEnrollmentConfig).as("apiRenewBeforeDays")
        );

      const results = (await query
        .orderBy(`${TableName.PkiCertificateProfile}.createdAt`, "desc")
        .offset(offset)
        .limit(limit)) as Record<string, unknown>[];

      return results.map((result: Record<string, unknown>) => {
        const estConfig =
          result.estId && result.estHashedPassphrase
            ? {
                id: result.estId as string,
                disableBootstrapCaValidation: !!result.estDisableBootstrapCaValidation,
                passphrase: result.estConfigHashedPassphrase,
                caChain: result.estEncryptedCaChain ? (result.estEncryptedCaChain as Buffer).toString("utf8") : ""
              }
            : undefined;

        const apiConfig = result.apiId
          ? {
              id: result.apiId as string,
              autoRenew: !!result.apiAutoRenew,
              renewBeforeDays: (result.apiRenewBeforeDays as number) || undefined
            }
          : undefined;

        const baseProfile = {
          id: result.id,
          projectId: result.projectId,
          caId: result.caId,
          certificateTemplateId: result.certificateTemplateId,
          slug: result.slug,
          description: result.description,
          enrollmentType: result.enrollmentType as EnrollmentType,
          estConfigId: result.estConfigId,
          apiConfigId: result.apiConfigId,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          estConfig,
          apiConfig
        };

        return baseProfile as TCertificateProfileWithConfigs;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profiles by project id" });
    }
  };

  const countByProjectId = async (
    projectId: string,
    options: {
      search?: string;
      enrollmentType?: EnrollmentType;
      caId?: string;
    } = {},
    tx?: Knex
  ): Promise<number> => {
    try {
      const { search, enrollmentType, caId } = options;

      let query = (tx || db)(TableName.PkiCertificateProfile).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.where((qb) => {
            void qb.whereILike("description", `%${search}%`).orWhereILike("slug", `%${search}%`);
          });
        });
      }

      if (enrollmentType) {
        query = query.where({ enrollmentType });
      }

      if (caId) {
        query = query.where({ caId });
      }

      const result = await query.count("*").first();
      return parseInt((result as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count certificate profiles by project id" });
    }
  };

  const findByNameAndProjectId = async (
    name: string,
    projectId: string,
    tx?: Knex
  ): Promise<TCertificateProfile | undefined> => {
    try {
      const certificateProfile = (await (tx || db)(TableName.PkiCertificateProfile)
        .where({ slug: name, projectId })
        .first()) as TCertificateProfile | undefined;
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by name and project id" });
    }
  };

  const getCertificatesByProfile = async (
    profileId: string,
    options: {
      offset?: number;
      limit?: number;
      status?: "active" | "expired" | "revoked";
      search?: string;
    } = {},
    tx?: Knex
  ): Promise<TCertificateProfileCertificate[]> => {
    try {
      const { offset = 0, limit = 20, status, search } = options;
      const now = new Date();

      let query = (tx || db)(TableName.Certificate).where("profileId", profileId);

      if (search) {
        query = query.where((builder) => {
          void builder.where((qb) => {
            void qb.whereILike("cn", `%${search}%`).orWhereILike("serialNumber", `%${search}%`);
          });
        });
      }

      if (status) {
        switch (status) {
          case "active":
            query = query.where("notAfter", ">", now).whereNull("revokedAt");
            break;
          case "expired":
            query = query.where("notAfter", "<=", now).whereNull("revokedAt");
            break;
          case "revoked":
            query = query.whereNotNull("revokedAt");
            break;
          default:
            break;
        }
      }

      const certificates = await query
        .select((tx || db).ref("id").withSchema(TableName.Certificate))
        .select((tx || db).ref("serialNumber").withSchema(TableName.Certificate))
        .select((tx || db).ref("cn").withSchema(TableName.Certificate))
        .select((tx || db).ref("status").withSchema(TableName.Certificate))
        .select((tx || db).ref("notBefore").withSchema(TableName.Certificate))
        .select((tx || db).ref("notAfter").withSchema(TableName.Certificate))
        .select((tx || db).ref("revokedAt").withSchema(TableName.Certificate))
        .select((tx || db).ref("createdAt").withSchema(TableName.Certificate))
        .orderBy("createdAt", "desc")
        .offset(offset)
        .limit(limit);

      return certificates.map((cert) => ({
        ...cert,
        revokedAt: cert.revokedAt ?? null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificates by profile" });
    }
  };

  const isProfileInUse = async (profileId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.Certificate).where("profileId", profileId).count("*").first();

      return parseInt((doc as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if certificate profile is in use" });
    }
  };

  return {
    ...certificateProfileOrm,
    create,
    updateById,
    deleteById,
    findById,
    findByIdWithConfigs,
    findBySlugAndProjectId,
    findByProjectId,
    countByProjectId,
    findByNameAndProjectId,
    getCertificatesByProfile,
    isProfileInUse
  };
};
