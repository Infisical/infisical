import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ProjectType, ProjectVersion, TableName } from "@app/db/schemas";
import { DynamicSecretLeaseStatus } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-types";
import { SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { DatabaseError } from "@app/lib/errors";
import { SecretSyncStatus } from "@app/services/secret-sync/secret-sync-types";

import { TSecretsProjectWarning } from "./insights-types";

// Relative severity weights for ranking projects by outstanding issues. Failed
// rotations are the most urgent signal (a credential that should have changed
// did not); duplicated secrets are the weakest (see the approximation note on
// the duplicate_groups CTE below).
export const PROJECT_WARNING_SEVERITY_WEIGHTS = {
  failedRotation: 100,
  failedSync: 50,
  orphanedLease: 25,
  staleSecret: 5,
  duplicatedSecret: 1
} as const;

type TProjectWarningRow = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  totalSecrets: string | number;
  staleSecrets: string | number;
  duplicatedSecrets: string | number | null;
  failedRotations: string | number;
  failedSyncs: string | number;
  orphanedLeases: string | number;
  severityScore: string | number;
  totalProjects: string | number;
  projectsWithIssues: string | number;
};

export type TInsightsDALFactory = ReturnType<typeof insightsDALFactory>;

export const insightsDALFactory = (db: TDbClient) => {
  const findProjectWarningsForOrg = async (
    orgId: string,
    { offset, limit, staleBefore }: { offset: number; limit: number; staleBefore: Date },
    tx?: Knex
  ): Promise<{ projects: TSecretsProjectWarning[]; totalProjects: number; projectsWithIssues: number }> => {
    try {
      const conn = tx || db.replicaNode();
      const weights = PROJECT_WARNING_SEVERITY_WEIGHTS;

      const rows = await conn
        // Every secret-manager project of the org, returned even with zero issues
        .with("org_projects", (qb) =>
          qb
            .from(TableName.Project)
            .where(`${TableName.Project}.orgId`, orgId)
            .whereNull(`${TableName.Project}.deleteAfter`)
            .where(`${TableName.Project}.type`, ProjectType.SecretManager)
            .where(`${TableName.Project}.version`, ProjectVersion.V3) // only secret-manager v3 projects are supported
            .select(
              `${TableName.Project}.id`,
              `${TableName.Project}.name`,
              `${TableName.Project}.slug`,
              `${TableName.Project}.secretBlindIndexEnabled`
            )
        )
        // totalSecrets + staleSecrets share one scan via FILTER. Mirrors
        // countByProject / countStaleByProject in secret-v2-bridge-dal.ts:
        // exclude personal/override secrets, skip soft-deleted environments.
        .with("secret_counts", (qb) =>
          qb
            .from(TableName.SecretV2)
            .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .join("org_projects", `${TableName.Environment}.projectId`, "org_projects.id")
            .whereNull(`${TableName.Environment}.deleteAfter`)
            .whereNull(`${TableName.SecretV2}.userId`)
            .groupBy(`${TableName.Environment}.projectId`)
            .select(`${TableName.Environment}.projectId`)
            .select(db.raw(`count(*) as "totalSecrets"`))
            .select(
              db.raw(`count(*) filter (where ??.?? < ?) as "staleSecrets"`, [
                TableName.SecretV2,
                "updatedAt",
                staleBefore
              ])
            )
        )
        // Duplicated secrets: secrets sharing a value blind index within a project.
        //
        // APPROXIMATION: unlike the per-project insights endpoint
        // (insights-service.ts getSecretsDuplication), this is SQL-only and does
        // NOT decrypt values to exclude secret references (`${...}` interpolation),
        // because decrypting every secret of every project in the org is
        // prohibitively expensive for a paginated org-level listing. Secrets that
        // merely reference the same secret are therefore counted as duplicates
        // here, so this count can be slightly higher than the duplication insight.
        // TODO: perform a load testing to check how bad this can be for large orgs.
        .with("duplicate_groups", (qb) =>
          qb
            .from(TableName.SecretV2)
            .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .join("org_projects", `${TableName.Environment}.projectId`, "org_projects.id")
            .whereNull(`${TableName.Environment}.deleteAfter`)
            .whereNull(`${TableName.SecretV2}.userId`)
            .whereNotNull(`${TableName.SecretV2}.secretValueBlindIndex`)
            .groupBy([`${TableName.Environment}.projectId`, `${TableName.SecretV2}.secretValueBlindIndex`])
            .having(db.raw("count(*) > 1"))
            .select(`${TableName.Environment}.projectId`)
            .select(db.raw(`count(*) as "dupCount"`))
        )
        .with("duplicated_counts", (qb) =>
          qb.from("duplicate_groups").groupBy("projectId").select("projectId").sum("dupCount as duplicatedSecrets")
        )
        .with("failed_rotations", (qb) =>
          qb
            .from(TableName.SecretRotationV2)
            .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .join("org_projects", `${TableName.Environment}.projectId`, "org_projects.id")
            .whereNull(`${TableName.Environment}.deleteAfter`)
            .where(`${TableName.SecretRotationV2}.rotationStatus`, SecretRotationStatus.Failed)
            .groupBy(`${TableName.Environment}.projectId`)
            .select(`${TableName.Environment}.projectId`)
            .select(db.raw(`count(*) as "failedRotations"`))
        )
        .with("failed_syncs", (qb) =>
          qb
            .from(TableName.SecretSync)
            .join("org_projects", `${TableName.SecretSync}.projectId`, "org_projects.id")
            .where(`${TableName.SecretSync}.syncStatus`, SecretSyncStatus.Failed)
            .groupBy(`${TableName.SecretSync}.projectId`)
            .select(`${TableName.SecretSync}.projectId`)
            .select(db.raw(`count(*) as "failedSyncs"`))
        )
        // Leases are hard-deleted on successful revocation/expiry (see the
        // countLeasesForOrg comment in dynamic-secret-lease-dal.ts), so any
        // surviving row with FailedDeletion status is an orphaned credential
        // that needs manual cleanup.
        .with("orphaned_leases", (qb) =>
          qb
            .from(TableName.DynamicSecretLease)
            .join(
              TableName.DynamicSecret,
              `${TableName.DynamicSecretLease}.dynamicSecretId`,
              `${TableName.DynamicSecret}.id`
            )
            .join(TableName.SecretFolder, `${TableName.DynamicSecret}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .join("org_projects", `${TableName.Environment}.projectId`, "org_projects.id")
            .whereNull(`${TableName.Environment}.deleteAfter`)
            .where(`${TableName.DynamicSecretLease}.status`, DynamicSecretLeaseStatus.FailedDeletion)
            .groupBy(`${TableName.Environment}.projectId`)
            .select(`${TableName.Environment}.projectId`)
            .select(db.raw(`count(*) as "orphanedLeases"`))
        )
        // Wrapping the scored rows in a CTE lets the outer query reference
        // "severityScore" in ORDER BY and in the FILTER window without
        // repeating the weighted-sum expression.
        .with("scored", (qb) =>
          qb
            .from("org_projects as p")
            .leftJoin("secret_counts as sc", "sc.projectId", "p.id")
            .leftJoin("duplicated_counts as dc", "dc.projectId", "p.id")
            .leftJoin("failed_rotations as fr", "fr.projectId", "p.id")
            .leftJoin("failed_syncs as fs", "fs.projectId", "p.id")
            .leftJoin("orphaned_leases as ol", "ol.projectId", "p.id")
            .select(
              "p.id as projectId",
              "p.name as projectName",
              "p.slug as projectSlug",
              db.raw(`coalesce(sc."totalSecrets", 0) as "totalSecrets"`),
              db.raw(`coalesce(sc."staleSecrets", 0) as "staleSecrets"`),
              // null (not 0) when blind indexing is off: the metric is unknowable, not zero
              db.raw(
                `case when p."secretBlindIndexEnabled" then coalesce(dc."duplicatedSecrets", 0) else null end as "duplicatedSecrets"`
              ),
              db.raw(`coalesce(fr."failedRotations", 0) as "failedRotations"`),
              db.raw(`coalesce(fs."failedSyncs", 0) as "failedSyncs"`),
              db.raw(`coalesce(ol."orphanedLeases", 0) as "orphanedLeases"`),
              db.raw(
                `(? * coalesce(fr."failedRotations", 0)
                + ? * coalesce(fs."failedSyncs", 0)
                + ? * coalesce(ol."orphanedLeases", 0)
                + ? * coalesce(sc."staleSecrets", 0)
                + ? * (case when p."secretBlindIndexEnabled" then coalesce(dc."duplicatedSecrets", 0) else 0 end)
                ) as "severityScore"`,
                [
                  weights.failedRotation,
                  weights.failedSync,
                  weights.orphanedLease,
                  weights.staleSecret,
                  weights.duplicatedSecret
                ]
              )
            )
        )
        .from<TProjectWarningRow>("scored")
        .select("scored.*")
        .select(db.raw(`count(*) over() as "totalProjects"`))
        .select(db.raw(`count(*) filter (where "severityScore" > 0) over() as "projectsWithIssues"`))
        .orderByRaw(`"severityScore" desc, "projectName" asc, "projectId" asc`)
        .offset(offset)
        .limit(limit);

      const typedRows = rows as unknown as TProjectWarningRow[];

      const projects = typedRows.map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        projectSlug: row.projectSlug,
        totalSecrets: Number(row.totalSecrets),
        severityScore: Number(row.severityScore),
        warnings: {
          duplicatedSecrets: row.duplicatedSecrets === null ? null : Number(row.duplicatedSecrets),
          staleSecrets: Number(row.staleSecrets),
          failedRotations: Number(row.failedRotations),
          failedSyncs: Number(row.failedSyncs),
          orphanedLeases: Number(row.orphanedLeases)
        }
      }));

      // Window totals are only recoverable from a returned row; an empty page
      // (no projects, or the client paged past the end) reports zeros, matching
      // the searchProjects precedent in project-dal.ts.
      return {
        projects,
        totalProjects: Number(typedRows[0]?.totalProjects ?? 0),
        projectsWithIssues: Number(typedRows[0]?.projectsWithIssues ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectWarningsForOrg" });
    }
  };

  return { findProjectWarningsForOrg };
};
