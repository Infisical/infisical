import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiAlertsV2, TPkiAlertsV2Insert, TPkiAlertsV2Update } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import {
  applyCaFilters,
  applyCertificateFilters,
  requiresProfileJoin,
  sanitizeLikeInput,
  shouldIncludeCAs
} from "./pki-alert-v2-filter-utils";
import { CertificateOrigin, TCertificatePreview, TPkiFilterRule } from "./pki-alert-v2-types";

export type TPkiAlertV2DALFactory = ReturnType<typeof pkiAlertV2DALFactory>;

export const pkiAlertV2DALFactory = (db: TDbClient) => {
  const pkiAlertV2Orm = ormify(db, TableName.PkiAlertsV2);

  const create = async (data: TPkiAlertsV2Insert, tx?: Knex): Promise<TPkiAlertsV2> => {
    try {
      const serializedData = {
        ...data,
        filters: data.filters ? JSON.stringify(data.filters) : null
      };
      const [res] = await (tx || db)(TableName.PkiAlertsV2).insert(serializedData).returning("*");

      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  };

  const updateById = async (id: string, data: TPkiAlertsV2Update, tx?: Knex): Promise<TPkiAlertsV2> => {
    try {
      const serializedData: Record<string, unknown> = {
        ...data,
        filters: data.filters !== undefined ? JSON.stringify(data.filters) : undefined
      };
      Object.keys(serializedData).forEach((key) => {
        if (serializedData[key] === undefined) {
          delete serializedData[key];
        }
      });

      const [res] = await (tx || db)(TableName.PkiAlertsV2).where({ id }).update(serializedData).returning("*");

      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateById" });
    }
  };

  const findById = async (id: string, tx?: Knex): Promise<TPkiAlertsV2 | null> => {
    try {
      const [res] = await (tx || db.replicaNode())(TableName.PkiAlertsV2).where({ id }).select("*");

      if (!res) return null;

      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  type TChannelResult = {
    id: string;
    alertId: string;
    channelType: string;
    config: unknown;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  type TAlertWithChannels = TPkiAlertsV2 & {
    channels: TChannelResult[];
  };

  const findByIdWithChannels = async (alertId: string, tx?: Knex): Promise<TAlertWithChannels | null> => {
    try {
      const [alert] = (await (tx || db.replicaNode())
        .select(selectAllTableCols(TableName.PkiAlertsV2))
        .from(TableName.PkiAlertsV2)
        .where(`${TableName.PkiAlertsV2}.id`, alertId)) as TPkiAlertsV2[];

      if (!alert) return null;

      const channels = (await (tx || db.replicaNode())
        .select(selectAllTableCols(TableName.PkiAlertChannels))
        .from(TableName.PkiAlertChannels)
        .where(`${TableName.PkiAlertChannels}.alertId`, alertId)) as TChannelResult[];

      return {
        ...alert,
        channels: channels || []
      } as TAlertWithChannels;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdWithChannels" });
    }
  };

  const findByProjectIdWithCount = async (
    projectId: string,
    filters?: {
      search?: string;
      eventType?: string;
      enabled?: boolean;
      limit?: number;
      offset?: number;
    },
    tx?: Knex
  ): Promise<{ alerts: TAlertWithChannels[]; total: number }> => {
    try {
      let countQuery = (tx || db.replicaNode())
        .count("* as count")
        .from(TableName.PkiAlertsV2)
        .where(`${TableName.PkiAlertsV2}.projectId`, projectId);

      if (filters?.search) {
        countQuery = countQuery.whereILike(`${TableName.PkiAlertsV2}.name`, `%${sanitizeLikeInput(filters.search)}%`);
      }

      if (filters?.eventType) {
        countQuery = countQuery.where(`${TableName.PkiAlertsV2}.eventType`, filters.eventType);
      }

      if (filters?.enabled !== undefined) {
        countQuery = countQuery.where(`${TableName.PkiAlertsV2}.enabled`, filters.enabled);
      }

      let alertQuery = (tx || db.replicaNode())
        .select(selectAllTableCols(TableName.PkiAlertsV2))
        .from(TableName.PkiAlertsV2)
        .where(`${TableName.PkiAlertsV2}.projectId`, projectId);

      if (filters?.search) {
        alertQuery = alertQuery.whereILike(`${TableName.PkiAlertsV2}.name`, `%${sanitizeLikeInput(filters.search)}%`);
      }

      if (filters?.eventType) {
        alertQuery = alertQuery.where(`${TableName.PkiAlertsV2}.eventType`, filters.eventType);
      }

      if (filters?.enabled !== undefined) {
        alertQuery = alertQuery.where(`${TableName.PkiAlertsV2}.enabled`, filters.enabled);
      }

      alertQuery = alertQuery.orderBy(`${TableName.PkiAlertsV2}.createdAt`, "desc");

      if (filters?.limit) {
        alertQuery = alertQuery.limit(filters.limit);
      }

      if (filters?.offset) {
        alertQuery = alertQuery.offset(filters.offset);
      }

      const [countResult, alerts] = await Promise.all([countQuery, alertQuery]);

      const total = parseInt((countResult[0] as { count: string }).count, 10);

      const alertIds = (alerts as TPkiAlertsV2[]).map((alert) => alert.id);
      const channels = (await (tx || db.replicaNode())
        .select(selectAllTableCols(TableName.PkiAlertChannels))
        .from(TableName.PkiAlertChannels)
        .whereIn(`${TableName.PkiAlertChannels}.alertId`, alertIds)) as TChannelResult[];

      const channelsByAlertId = channels.reduce(
        (acc, channel) => {
          if (!acc[channel.alertId]) {
            acc[channel.alertId] = [];
          }
          acc[channel.alertId].push(channel);
          return acc;
        },
        {} as Record<string, TChannelResult[]>
      );

      const alertsWithChannels: TAlertWithChannels[] = (alerts as TPkiAlertsV2[]).map((alert) => ({
        ...alert,
        channels: channelsByAlertId[alert.id] || []
      }));

      return { alerts: alertsWithChannels, total };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectIdWithCount" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    filters?: {
      search?: string;
      eventType?: string;
      enabled?: boolean;
      limit?: number;
      offset?: number;
    },
    tx?: Knex
  ): Promise<TAlertWithChannels[]> => {
    const result = await findByProjectIdWithCount(projectId, filters, tx);
    return result.alerts;
  };

  const countByProjectId = async (
    projectId: string,
    filters?: {
      search?: string;
      eventType?: string;
      enabled?: boolean;
    },
    tx?: Knex
  ): Promise<number> => {
    try {
      let query = (tx || db.replicaNode())
        .count("* as count")
        .from(TableName.PkiAlertsV2)
        .where(`${TableName.PkiAlertsV2}.projectId`, projectId);

      if (filters?.search) {
        query = query.whereILike(`${TableName.PkiAlertsV2}.name`, `%${sanitizeLikeInput(filters.search)}%`);
      }

      if (filters?.eventType) {
        query = query.where(`${TableName.PkiAlertsV2}.eventType`, filters.eventType);
      }

      if (filters?.enabled !== undefined) {
        query = query.where(`${TableName.PkiAlertsV2}.enabled`, filters.enabled);
      }

      const result = await query;
      return parseInt((result[0] as { count: string }).count, 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountByProjectId" });
    }
  };

  const getDistinctProjectIds = async (
    filters?: {
      enabled?: boolean;
    },
    tx?: Knex
  ): Promise<string[]> => {
    try {
      let query = (tx || db.replicaNode()).distinct(`${TableName.PkiAlertsV2}.projectId`).from(TableName.PkiAlertsV2);

      if (filters?.enabled !== undefined) {
        query = query.where(`${TableName.PkiAlertsV2}.enabled`, filters.enabled);
      }

      const result = await query;
      return result.map((row: { projectId: string }) => row.projectId);
    } catch (error) {
      throw new DatabaseError({ error, name: "GetDistinctProjectIds" });
    }
  };

  const findMatchingCertificates = async (
    projectId: string,
    filters: TPkiFilterRule[] = [],
    options?: {
      limit?: number;
      offset?: number;
      alertBefore?: string;
      showFutureMatches?: boolean;
      showCurrentMatches?: boolean;
      showPreview?: boolean;
      excludeAlerted?: boolean;
      alertId?: string;
    },
    tx?: Knex
  ): Promise<{ certificates: TCertificatePreview[]; total: number }> => {
    try {
      const includeCAs = shouldIncludeCAs(filters);
      const needsProfileJoin = requiresProfileJoin(filters);
      const limit = options?.limit || 10;
      const offset = options?.offset || 0;

      let caTotalCount = 0;
      let certTotalCount = 0;

      if (includeCAs) {
        let caCountQuery = (tx || db.replicaNode())
          .count("* as count")
          .from(TableName.CertificateAuthority)
          .innerJoin(
            `${TableName.InternalCertificateAuthority} as ica`,
            `${TableName.CertificateAuthority}.id`,
            `ica.caId`
          );

        caCountQuery = applyCaFilters(caCountQuery, filters, projectId) as typeof caCountQuery;

        if (options?.alertBefore) {
          if (options.showFutureMatches) {
            caCountQuery = caCountQuery
              .whereRaw(`ica."notAfter" > NOW() + ?::interval`, [options.alertBefore])
              .whereRaw(`ica."notAfter" > NOW()`);
          } else if (options.showCurrentMatches) {
            caCountQuery = caCountQuery
              .whereRaw(`ica."notAfter" > NOW()`)
              .whereRaw(`ica."notAfter" <= NOW() + ?::interval`, [options.alertBefore]);
          } else {
            caCountQuery = caCountQuery
              .whereRaw(`ica."notAfter" > NOW()`)
              .whereRaw(`ica."notAfter" <= NOW() + ?::interval`, [options.alertBefore]);
          }
        }

        const caCountResult = await caCountQuery;
        caTotalCount = parseInt((caCountResult[0] as { count: string }).count, 10);
      }

      let certCountQuery = (tx || db.replicaNode()).count("* as count").from(TableName.Certificate);
      certCountQuery = applyCertificateFilters(certCountQuery, filters, projectId) as typeof certCountQuery;

      if (options?.showPreview) {
        certCountQuery = certCountQuery
          .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
          .whereNot(`${TableName.Certificate}.status`, "revoked");
      } else if (options?.alertBefore) {
        if (options.showFutureMatches) {
          certCountQuery = certCountQuery
            .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW() + ?::interval`, [options.alertBefore])
            .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
            .whereNot(`${TableName.Certificate}.status`, "revoked");
        } else if (options.showCurrentMatches) {
          certCountQuery = certCountQuery
            .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
            .whereRaw(`"${TableName.Certificate}"."notAfter" <= NOW() + ?::interval`, [options.alertBefore])
            .whereNot(`${TableName.Certificate}.status`, "revoked");
        } else {
          certCountQuery = certCountQuery
            .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
            .whereRaw(`"${TableName.Certificate}"."notAfter" <= NOW() + ?::interval`, [options.alertBefore])
            .whereNot(`${TableName.Certificate}.status`, "revoked");
        }
      }

      if (options?.excludeAlerted && options?.alertId) {
        certCountQuery = certCountQuery.whereNotExists(
          (tx || db.replicaNode())
            .select("*")
            .from(TableName.PkiAlertHistory)
            .join(
              TableName.PkiAlertHistoryCertificate,
              `${TableName.PkiAlertHistory}.id`,
              `${TableName.PkiAlertHistoryCertificate}.alertHistoryId`
            )
            .where(`${TableName.PkiAlertHistory}.alertId`, options.alertId)
            .whereRaw(`"${TableName.PkiAlertHistoryCertificate}"."certificateId" = "${TableName.Certificate}".id`)
        );
      }

      const certCountResult = await certCountQuery;
      certTotalCount = parseInt((certCountResult[0] as { count: string }).count, 10);

      const totalCount = caTotalCount + certTotalCount;
      let results: TCertificatePreview[] = [];

      const fetchCertificates = async (certLimit: number, certOffset: number) => {
        const selectColumns = [
          `${TableName.Certificate}.id`,
          `${TableName.Certificate}.serialNumber`,
          `${TableName.Certificate}.commonName`,
          `${TableName.Certificate}.altNames as san`,
          `${TableName.Certificate}.notBefore`,
          `${TableName.Certificate}.notAfter`,
          `${TableName.Certificate}.status`,
          `${TableName.Certificate}.profileId`,
          `${TableName.Certificate}.pkiSubscriberId`
        ];

        if (needsProfileJoin) {
          selectColumns.push("profile.slug as profileName");
        }

        let certificateQuery = (tx || db.replicaNode()).select(selectColumns).from(TableName.Certificate);

        certificateQuery = applyCertificateFilters(certificateQuery, filters, projectId) as typeof certificateQuery;

        if (options?.showPreview) {
          certificateQuery = certificateQuery
            .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
            .whereNot(`${TableName.Certificate}.status`, "revoked");
        } else if (options?.alertBefore) {
          if (options.showFutureMatches) {
            certificateQuery = certificateQuery
              .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW() + ?::interval`, [options.alertBefore])
              .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
              .whereNot(`${TableName.Certificate}.status`, "revoked");
          } else if (options.showCurrentMatches) {
            certificateQuery = certificateQuery
              .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
              .whereRaw(`"${TableName.Certificate}"."notAfter" <= NOW() + ?::interval`, [options.alertBefore])
              .whereNot(`${TableName.Certificate}.status`, "revoked");
          } else {
            certificateQuery = certificateQuery
              .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`)
              .whereRaw(`"${TableName.Certificate}"."notAfter" <= NOW() + ?::interval`, [options.alertBefore])
              .whereNot(`${TableName.Certificate}.status`, "revoked");
          }
        }

        if (options?.excludeAlerted && options?.alertId) {
          certificateQuery = certificateQuery.whereNotExists(
            (tx || db.replicaNode())
              .select("*")
              .from(TableName.PkiAlertHistory)
              .join(
                TableName.PkiAlertHistoryCertificate,
                `${TableName.PkiAlertHistory}.id`,
                `${TableName.PkiAlertHistoryCertificate}.alertHistoryId`
              )
              .where(`${TableName.PkiAlertHistory}.alertId`, options.alertId)
              .whereRaw(`"${TableName.PkiAlertHistoryCertificate}"."certificateId" = "${TableName.Certificate}".id`)
          );
        }

        certificateQuery = certificateQuery
          .orderBy(`${TableName.Certificate}.notAfter`, "asc")
          .limit(certLimit)
          .offset(certOffset);

        const certificates = await certificateQuery;
        const formattedCertificates: TCertificatePreview[] = (
          certificates as Array<{
            id: string;
            serialNumber: string;
            commonName: string;
            san: string[] | null;
            profileId: string | null;
            pkiSubscriberId: string | null;
            profileName?: string | null;
            notBefore: Date;
            notAfter: Date;
            status: string;
          }>
        ).map((cert) => {
          let enrollmentType = CertificateOrigin.UNKNOWN;
          if (cert.profileId) {
            enrollmentType = CertificateOrigin.PROFILE;
          } else if (cert.pkiSubscriberId) {
            enrollmentType = CertificateOrigin.IMPORT;
          }

          return {
            id: cert.id,
            serialNumber: cert.serialNumber,
            commonName: cert.commonName,
            san: Array.isArray(cert.san) ? cert.san : [],
            profileName: cert.profileName || null,
            enrollmentType,
            notBefore: cert.notBefore,
            notAfter: cert.notAfter,
            status: cert.status
          };
        });

        results = [...results, ...formattedCertificates];
      };

      if (offset < caTotalCount) {
        const caLimit = Math.min(limit, caTotalCount - offset);
        const caOffset = offset;

        let caQuery = (tx || db.replicaNode())
          .select(
            `${TableName.CertificateAuthority}.id`,
            `ica.serialNumber`,
            `ica.commonName`,
            `ica.notBefore`,
            `ica.notAfter`
          )
          .from(TableName.CertificateAuthority)
          .innerJoin(
            `${TableName.InternalCertificateAuthority} as ica`,
            `${TableName.CertificateAuthority}.id`,
            `ica.caId`
          );

        caQuery = applyCaFilters(caQuery, filters, projectId) as typeof caQuery;

        if (options?.alertBefore) {
          if (options.showFutureMatches) {
            caQuery = caQuery
              .whereRaw(`ica."notAfter" > NOW() + ?::interval`, [options.alertBefore])
              .whereRaw(`ica."notAfter" > NOW()`);
          } else {
            caQuery = caQuery
              .whereRaw(`ica."notAfter" > NOW()`)
              .whereRaw(`ica."notAfter" <= NOW() + ?::interval`, [options.alertBefore]);
          }
        }

        caQuery = caQuery.orderBy(`ica.notAfter`, "asc").limit(caLimit).offset(caOffset);

        const cas = await caQuery;
        const formattedCAs: TCertificatePreview[] = (
          cas as Array<{
            id: string;
            serialNumber: string;
            commonName: string;
            notBefore: Date;
            notAfter: Date;
          }>
        ).map((ca) => ({
          id: ca.id,
          serialNumber: ca.serialNumber,
          commonName: ca.commonName,
          san: [],
          profileName: null,
          enrollmentType: CertificateOrigin.CA,
          notBefore: ca.notBefore,
          notAfter: ca.notAfter,
          status: "active"
        }));

        results = [...results, ...formattedCAs];

        const remainingLimit = limit - caLimit;
        if (remainingLimit > 0 && certTotalCount > 0) {
          const certOffset = 0;
          await fetchCertificates(remainingLimit, certOffset);
        }
      } else {
        const certOffset = offset - caTotalCount;
        await fetchCertificates(limit, certOffset);
      }

      return {
        certificates: results,
        total: totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindMatchingCertificates" });
    }
  };

  return {
    ...pkiAlertV2Orm,
    create,
    updateById,
    findById,
    findByIdWithChannels,
    findByProjectId,
    findByProjectIdWithCount,
    countByProjectId,
    getDistinctProjectIds,
    findMatchingCertificates
  };
};
