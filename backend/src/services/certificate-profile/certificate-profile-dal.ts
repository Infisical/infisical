import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import {
  EnrollmentType,
  TCertificateProfileCertificate,
  TCertificateProfileInsert,
  TCertificateProfileMetrics,
  TCertificateProfileUpdate
} from "./certificate-profile-types";

export type TCertificateProfileDALFactory = ReturnType<typeof certificateProfileDALFactory>;

export const certificateProfileDALFactory = (db: TDbClient) => {
  const certificateProfileOrm = ormify(db, TableName.CertificateProfile);

  const create = async (data: TCertificateProfileInsert, tx?: Knex) => {
    try {
      const [certificateProfile] = await (tx || db)(TableName.CertificateProfile).insert(data).returning("*");
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create certificate profile" });
    }
  };

  const updateById = async (id: string, data: TCertificateProfileUpdate, tx?: Knex) => {
    try {
      const [certificateProfile] = await (tx || db)(TableName.CertificateProfile)
        .where({ id })
        .update(data)
        .returning("*");
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate profile" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [certificateProfile] = await (tx || db)(TableName.CertificateProfile).where({ id }).del().returning("*");
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete certificate profile" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const certificateProfile = await (tx || db)(TableName.CertificateProfile).where({ id }).first();
      return certificateProfile;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by id" });
    }
  };

  const findByIdWithConfigs = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.CertificateProfile)
        .select(
          selectAllTableCols(TableName.CertificateProfile),
          (tx || db).ref("id").withSchema(TableName.CertificateAuthority).as("caId"),
          (tx || db).ref("projectId").withSchema(TableName.CertificateAuthority).as("caProjectId"),
          (tx || db).ref("status").withSchema(TableName.CertificateAuthority).as("caStatus"),
          (tx || db).ref("name").withSchema(TableName.CertificateAuthority).as("caName"),
          (tx || db).ref("id").withSchema(TableName.CertificateTemplateV2).as("templateId"),
          (tx || db).ref("projectId").withSchema(TableName.CertificateTemplateV2).as("templateProjectId"),
          (tx || db).ref("slug").withSchema(TableName.CertificateTemplateV2).as("templateName"),
          (tx || db).ref("description").withSchema(TableName.CertificateTemplateV2).as("templateDescription"),
          (tx || db).ref("id").withSchema(TableName.PkiEstEnrollmentConfig).as("estConfigId"),
          (tx || db)
            .ref("disableBootstrapCaValidation")
            .withSchema(TableName.PkiEstEnrollmentConfig)
            .as("estConfigDisableBootstrapCaValidation"),
          (tx || db)
            .ref("hashedPassphrase")
            .withSchema(TableName.PkiEstEnrollmentConfig)
            .as("estConfigHashedPassphrase"),
          (tx || db)
            .ref("encryptedCaChain")
            .withSchema(TableName.PkiEstEnrollmentConfig)
            .as("estConfigEncryptedCaChain"),
          (tx || db).ref("id").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigId"),
          (tx || db).ref("autoRenew").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigAutoRenew"),
          (tx || db).ref("autoRenewDays").withSchema(TableName.PkiApiEnrollmentConfig).as("apiConfigAutoRenewDays")
        )
        .leftJoin(
          TableName.CertificateAuthority,
          `${TableName.CertificateProfile}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .leftJoin(
          TableName.CertificateTemplateV2,
          `${TableName.CertificateProfile}.certificateTemplateId`,
          `${TableName.CertificateTemplateV2}.id`
        )
        .leftJoin(
          TableName.PkiEstEnrollmentConfig,
          `${TableName.CertificateProfile}.estConfigId`,
          `${TableName.PkiEstEnrollmentConfig}.id`
        )
        .leftJoin(
          TableName.PkiApiEnrollmentConfig,
          `${TableName.CertificateProfile}.apiConfigId`,
          `${TableName.PkiApiEnrollmentConfig}.id`
        )
        .where(`${TableName.CertificateProfile}.id`, id)
        .first();

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find certificate profile by id with configs" });
    }
  };

  const findBySlugAndProjectId = async (slug: string, projectId: string, tx?: Knex) => {
    try {
      const certificateProfile = await (tx || db)(TableName.CertificateProfile).where({ slug, projectId }).first();
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
      includeMetrics?: boolean;
      expiringDays?: number;
    } = {},
    tx?: Knex
  ) => {
    try {
      const {
        offset = 0,
        limit = 20,
        search,
        enrollmentType,
        caId,
        includeMetrics = false,
        expiringDays = 7
      } = options;

      let query = (tx || db)(TableName.CertificateProfile).where(
        `${TableName.CertificateProfile}.projectId`,
        projectId
      );

      if (search) {
        query = query.where((builder) => {
          void builder
            .whereILike(`${TableName.CertificateProfile}.slug`, `%${search}%`)
            .orWhereILike(`${TableName.CertificateProfile}.description`, `%${search}%`);
        });
      }

      if (enrollmentType) {
        query = query.where(`${TableName.CertificateProfile}.enrollmentType`, enrollmentType);
      }

      if (caId) {
        query = query.where(`${TableName.CertificateProfile}.caId`, caId);
      }

      if (includeMetrics) {
        const now = new Date();
        const expiringDate = new Date();
        expiringDate.setDate(now.getDate() + expiringDays);

        const certificateProfiles = await query
          .leftJoin(TableName.Certificate, `${TableName.CertificateProfile}.id`, `${TableName.Certificate}.profileId`)
          .select(
            selectAllTableCols(TableName.CertificateProfile),
            db.raw("COUNT(certificates.id) as total_certificates"),
            db.raw(
              'COUNT(CASE WHEN certificates."revokedAt" IS NULL AND certificates."notAfter" > ? THEN 1 END) as active_certificates',
              [expiringDate]
            ),
            db.raw(
              'COUNT(CASE WHEN certificates."revokedAt" IS NULL AND certificates."notAfter" <= ? THEN 1 END) as expired_certificates',
              [now]
            ),
            db.raw(
              'COUNT(CASE WHEN certificates."revokedAt" IS NULL AND certificates."notAfter" > ? AND certificates."notAfter" <= ? THEN 1 END) as expiring_certificates',
              [now, expiringDate]
            ),
            db.raw('COUNT(CASE WHEN certificates."revokedAt" IS NOT NULL THEN 1 END) as revoked_certificates')
          )
          .groupBy(`${TableName.CertificateProfile}.id`)
          .orderBy(`${TableName.CertificateProfile}.createdAt`, "desc")
          .offset(offset)
          .limit(limit);

        return certificateProfiles;
      }

      const certificateProfiles = await query
        .select(selectAllTableCols(TableName.CertificateProfile))
        .orderBy(`${TableName.CertificateProfile}.createdAt`, "desc")
        .offset(offset)
        .limit(limit);

      return certificateProfiles;
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
  ) => {
    try {
      const { search, enrollmentType, caId } = options;

      let query = (tx || db)(TableName.CertificateProfile).where({ projectId });

      if (search) {
        query = query.where((builder) => {
          void builder.orWhereILike("description", `%${search}%`).orWhereILike("slug", `%${search}%`);
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

  const findByNameAndProjectId = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const certificateProfile = await (tx || db)(TableName.CertificateProfile)
        .where({ slug: name, projectId })
        .first();
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
          void builder.whereILike("cn", `%${search}%`).orWhereILike("serialNumber", `%${search}%`);
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

      return certificates;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificates by profile" });
    }
  };

  const getProfileMetrics = async (
    profileId: string,
    expiringDays: number = 7,
    tx?: Knex
  ): Promise<TCertificateProfileMetrics> => {
    try {
      const now = new Date();
      const expiringDate = new Date();
      expiringDate.setDate(now.getDate() + expiringDays);

      const metrics = await (tx || db)(TableName.Certificate)
        .where("profileId", profileId)
        .select(
          db.raw("COUNT(*) as total_certificates"),
          db.raw('COUNT(CASE WHEN "revokedAt" IS NULL AND "notAfter" > ? THEN 1 END) as active_certificates', [
            expiringDate
          ]),
          db.raw('COUNT(CASE WHEN "revokedAt" IS NULL AND "notAfter" <= ? THEN 1 END) as expired_certificates', [now]),
          db.raw(
            'COUNT(CASE WHEN "revokedAt" IS NULL AND "notAfter" > ? AND "notAfter" <= ? THEN 1 END) as expiring_certificates',
            [now, expiringDate]
          ),
          db.raw('COUNT(CASE WHEN "revokedAt" IS NOT NULL THEN 1 END) as revoked_certificates')
        )
        .first();

      return {
        profileId,
        totalCertificates: parseInt(String((metrics as Record<string, unknown>)?.total_certificates || 0), 10),
        activeCertificates: parseInt(String((metrics as Record<string, unknown>)?.active_certificates || 0), 10),
        expiredCertificates: parseInt(String((metrics as Record<string, unknown>)?.expired_certificates || 0), 10),
        expiringCertificates: parseInt(String((metrics as Record<string, unknown>)?.expiring_certificates || 0), 10),
        revokedCertificates: parseInt(String((metrics as Record<string, unknown>)?.revoked_certificates || 0), 10)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificate profile metrics" });
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
    getProfileMetrics,
    isProfileInUse
  };
};
