import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TTelemetryDALFactory = ReturnType<typeof telemetryDALFactory>;

const IDENTITY_AUTH_TABLES: readonly string[] = [
  TableName.IdentityUniversalAuth,
  TableName.IdentityTokenAuth,
  TableName.IdentityKubernetesAuth,
  TableName.IdentityGcpAuth,
  TableName.IdentityAwsAuth,
  TableName.IdentityAzureAuth,
  TableName.IdentityOciAuth,
  TableName.IdentityOidcAuth,
  TableName.IdentityJwtAuth,
  TableName.IdentityLdapAuth,
  TableName.IdentityAliCloudAuth,
  TableName.IdentityTlsCertAuth,
  TableName.IdentitySpiffeAuth
];

// Gateways with a heartbeat within the last 60 seconds are considered active
const GATEWAY_HEARTBEAT_THRESHOLD_SECONDS = 60;

const countTable = async (db: TDbClient, table: TableName) => {
  const result = (await db(table).count().first())?.count as string;
  return parseInt(result || "0", 10);
};

export const telemetryDALFactory = (db: TDbClient) => {
  const getTelemetryInstanceStats = async () => {
    try {
      const [
        users,
        identities,
        projects,
        secrets,
        environments,
        secretSyncs,
        integrations,
        certificateAuthorities,
        certificates,
        dynamicSecrets,
        groups,
        secretApprovalPolicies
      ] = await Promise.all([
        (async () => {
          const result = (await db(TableName.Users).where({ isGhost: false }).count().first())?.count as string;
          return parseInt(result || "0", 10);
        })(),
        countTable(db, TableName.Identity),
        countTable(db, TableName.Project),
        countTable(db, TableName.Secret),
        countTable(db, TableName.Environment),
        countTable(db, TableName.SecretSync),
        countTable(db, TableName.Integration),
        countTable(db, TableName.CertificateAuthority),
        countTable(db, TableName.Certificate),
        countTable(db, TableName.DynamicSecret),
        countTable(db, TableName.Groups),
        countTable(db, TableName.SecretApprovalPolicy)
      ]);

      const identityAuthMethodsResult = await db.raw<{ rows: { count: string }[] }>(
        IDENTITY_AUTH_TABLES.map((table) => `SELECT COUNT(*)::text AS count FROM ${table}`).join(" UNION ALL ")
      );
      const identityAuthMethods = identityAuthMethodsResult.rows.reduce(
        (sum: number, row: { count: string }) => sum + parseInt(row.count || "0", 10),
        0
      );

      const activeGatewaysResult = (
        await db(TableName.Gateway)
          .whereRaw(`"heartbeat" > NOW() - INTERVAL '${GATEWAY_HEARTBEAT_THRESHOLD_SECONDS} seconds'`)
          .count()
          .first()
      )?.count as string;
      const activeGateways = parseInt(activeGatewaysResult || "0", 10);

      const organizationNames = await db(TableName.Organization).select("name");
      const organizations = organizationNames.length;

      return {
        users,
        identities,
        projects,
        secrets,
        organizations,
        organizationNames: organizationNames.map(({ name }) => name),
        environments,
        secretSyncs,
        integrations,
        certificateAuthorities,
        certificates,
        dynamicSecrets,
        identityAuthMethods,
        groups,
        secretApprovalPolicies,
        activeGateways
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "TelemetryInstanceStats" });
    }
  };

  return { getTelemetryInstanceStats };
};
