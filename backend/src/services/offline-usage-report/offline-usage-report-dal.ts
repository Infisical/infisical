import { TDbClient } from "@app/db";
import { ProjectType, TableName } from "@app/db/schemas/models";

export type TOfflineUsageReportDALFactory = ReturnType<typeof offlineUsageReportDALFactory>;

export const offlineUsageReportDALFactory = (db: TDbClient) => {
  const getUserMetrics = async () => {
    // Get total users and admin users
    const userMetrics = (await db
      .from(TableName.Users)
      .select(
        db.raw(
          `
          COUNT(*) as total_users,
          COUNT(CASE WHEN "superAdmin" = true THEN 1 END) as admin_users
        `
        )
      )
      .where({ isGhost: false })
      .first()) as { total_users: string; admin_users: string } | undefined;

    // Get users by auth method
    const authMethodStats = (await db
      .from(TableName.Users)
      .select(
        db.raw(`
          unnest("authMethods") as auth_method,
          COUNT(*) as count
        `)
      )
      .where({ isGhost: false })
      .whereNotNull("authMethods")
      .groupBy(db.raw('unnest("authMethods")'))) as Array<{ auth_method: string; count: string }>;

    const usersByAuthMethod = authMethodStats.reduce(
      (acc: Record<string, number>, row: { auth_method: string; count: string }) => {
        acc[row.auth_method] = parseInt(row.count, 10);
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalUsers: parseInt(userMetrics?.total_users || "0", 10),
      adminUsers: parseInt(userMetrics?.admin_users || "0", 10),
      usersByAuthMethod
    };
  };

  const getMachineIdentityMetrics = async () => {
    // Get total machine identities
    const identityMetrics = (await db
      .from(TableName.Identity)
      .select(
        db.raw(
          `
          COUNT(*) as total_identities
        `
        )
      )
      .first()) as { total_identities: string } | undefined;

    // Get identities by auth method
    const authMethodStats = (await db
      .from(TableName.Identity)
      .select("authMethod")
      .count("* as count")
      .whereNotNull("authMethod")
      .groupBy("authMethod")) as Array<{ authMethod: string; count: string }>;

    const machineIdentitiesByAuthMethod = authMethodStats.reduce(
      (acc: Record<string, number>, row: { authMethod: string; count: string }) => {
        acc[row.authMethod] = parseInt(row.count, 10);
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalMachineIdentities: parseInt(identityMetrics?.total_identities || "0", 10),
      machineIdentitiesByAuthMethod
    };
  };

  const getProjectMetrics = async () => {
    // Get total projects and projects by type
    const projectMetrics = (await db
      .from(TableName.Project)
      .select("type")
      .count("* as count")
      .groupBy("type")) as Array<{ type: string; count: string }>;

    const totalProjects = projectMetrics.reduce(
      (sum, row: { type: string; count: string }) => sum + parseInt(row.count, 10),
      0
    );
    const projectsByType = projectMetrics.reduce(
      (acc: Record<string, number>, row: { type: string; count: string }) => {
        acc[row.type] = parseInt(row.count, 10);
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate average secrets per project
    const secretsPerProject = (await db
      .from(`${TableName.SecretV2} as s`)
      .select("p.id as projectId")
      .count("s.id as count")
      .leftJoin(`${TableName.SecretFolder} as sf`, "s.folderId", "sf.id")
      .leftJoin(`${TableName.Environment} as e`, "sf.envId", "e.id")
      .leftJoin(`${TableName.Project} as p`, "e.projectId", "p.id")
      .where("p.type", ProjectType.SecretManager)
      .groupBy("p.id")
      .whereNotNull("p.id")) as Array<{ projectId: string; count: string }>;

    const averageSecretsPerProject =
      secretsPerProject.length > 0
        ? secretsPerProject.reduce(
            (sum, row: { projectId: string; count: string }) => sum + parseInt(row.count, 10),
            0
          ) / secretsPerProject.length
        : 0;

    return {
      totalProjects,
      projectsByType,
      averageSecretsPerProject: Math.round(averageSecretsPerProject * 100) / 100
    };
  };

  const getSecretMetrics = async () => {
    // Get total secrets
    const totalSecretsResult = (await db.from(TableName.SecretV2).count("* as count").first()) as
      | { count: string }
      | undefined;

    const totalSecrets = parseInt(totalSecretsResult?.count || "0", 10);

    // Get secrets by project
    const secretsByProject = (await db
      .from(`${TableName.SecretV2} as s`)
      .select("p.id as projectId", "p.name as projectName")
      .count("s.id as secretCount")
      .leftJoin(`${TableName.SecretFolder} as sf`, "s.folderId", "sf.id")
      .leftJoin(`${TableName.Environment} as e`, "sf.envId", "e.id")
      .leftJoin(`${TableName.Project} as p`, "e.projectId", "p.id")
      .where("p.type", ProjectType.SecretManager)
      .groupBy("p.id", "p.name")
      .whereNotNull("p.id")) as Array<{ projectId: string; projectName: string; secretCount: string }>;

    return {
      totalSecrets,
      secretsByProject: secretsByProject.map(
        (row: { projectId: string; projectName: string; secretCount: string }) => ({
          projectId: row.projectId,
          projectName: row.projectName,
          secretCount: parseInt(row.secretCount, 10)
        })
      )
    };
  };

  const getSecretSyncMetrics = async () => {
    const totalSecretSyncsResult = (await db.from(TableName.SecretSync).count("* as count").first()) as
      | { count: string }
      | undefined;

    return {
      totalSecretSyncs: parseInt(totalSecretSyncsResult?.count || "0", 10)
    };
  };

  const getDynamicSecretMetrics = async () => {
    const totalDynamicSecretsResult = (await db.from(TableName.DynamicSecret).count("* as count").first()) as
      | { count: string }
      | undefined;

    return {
      totalDynamicSecrets: parseInt(totalDynamicSecretsResult?.count || "0", 10)
    };
  };

  const getSecretRotationMetrics = async () => {
    // Check both v1 and v2 secret rotation tables
    const [v1RotationsResult, v2RotationsResult] = await Promise.all([
      db.from(TableName.SecretRotation).count("* as count").first() as Promise<{ count: string } | undefined>,
      db.from(TableName.SecretRotationV2).count("* as count").first() as Promise<{ count: string } | undefined>
    ]);

    const totalV1Rotations = parseInt(v1RotationsResult?.count || "0", 10);
    const totalV2Rotations = parseInt(v2RotationsResult?.count || "0", 10);

    return {
      totalSecretRotations: totalV1Rotations + totalV2Rotations
    };
  };

  return {
    getUserMetrics,
    getMachineIdentityMetrics,
    getProjectMetrics,
    getSecretMetrics,
    getSecretSyncMetrics,
    getDynamicSecretMetrics,
    getSecretRotationMetrics
  };
};
