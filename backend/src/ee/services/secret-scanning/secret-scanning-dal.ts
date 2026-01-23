import knex, { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSecretScanningGitRisksInsert } from "@app/db/schemas/secret-scanning-git-risks";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { SecretScanningResolvedStatus, TGetOrgRisksDTO } from "./secret-scanning-types";

export type TSecretScanningDALFactory = ReturnType<typeof secretScanningDALFactory>;

export const secretScanningDALFactory = (db: TDbClient) => {
  const gitRiskOrm = ormify(db, TableName.SecretScanningGitRisk);

  const upsert = async (data: TSecretScanningGitRisksInsert[], tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretScanningGitRisk).insert(data).onConflict("fingerprint").merge();
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "GitRiskUpsert" });
    }
  };

  const findByOrgId = async (orgId: string, filter: TGetOrgRisksDTO["filter"], tx?: Knex) => {
    try {
      // Find statements
      const sqlQuery = (tx || db.replicaNode())(TableName.SecretScanningGitRisk)
        // eslint-disable-next-line func-names
        .where(`${TableName.SecretScanningGitRisk}.orgId`, orgId);

      if (filter.repositoryNames) {
        void sqlQuery.whereIn(`${TableName.SecretScanningGitRisk}.repositoryFullName`, filter.repositoryNames);
      }

      if (filter.resolvedStatus) {
        if (filter.resolvedStatus !== SecretScanningResolvedStatus.All) {
          const isResolved = filter.resolvedStatus === SecretScanningResolvedStatus.Resolved;

          void sqlQuery.where(`${TableName.SecretScanningGitRisk}.isResolved`, isResolved);
        }
      }

      // Select statements
      void sqlQuery
        .select(selectAllTableCols(TableName.SecretScanningGitRisk))
        .limit(filter.limit)
        .offset(filter.offset);

      if (filter.orderBy) {
        const orderDirection = filter.orderDirection || OrderByDirection.ASC;

        void sqlQuery.orderBy(filter.orderBy, orderDirection);
      }

      const countQuery = (tx || db.replicaNode())(TableName.SecretScanningGitRisk)
        .where(`${TableName.SecretScanningGitRisk}.orgId`, orgId)
        .count();

      const uniqueReposQuery = (tx || db.replicaNode())(TableName.SecretScanningGitRisk)
        .where(`${TableName.SecretScanningGitRisk}.orgId`, orgId)
        .distinct("repositoryFullName")
        .select("repositoryFullName");

      // we timeout long running queries to prevent DB resource issues (2 minutes)
      const docs = await sqlQuery.timeout(1000 * 120);
      const uniqueRepos = await uniqueReposQuery.timeout(1000 * 120);
      const totalCount = await countQuery;

      return {
        risks: docs,
        totalCount: Number(totalCount?.[0].count),
        repos: uniqueRepos
          .filter(Boolean)
          .map((r) => r.repositoryFullName!)
          .sort((a, b) => a.localeCompare(b))
      };
    } catch (error) {
      if (error instanceof knex.KnexTimeoutError) {
        throw new GatewayTimeoutError({
          error,
          message: "Failed to fetch secret leaks due to timeout. Add more search filters."
        });
      }

      throw new DatabaseError({ error });
    }
  };

  return { ...gitRiskOrm, upsert, findByOrgId };
};
