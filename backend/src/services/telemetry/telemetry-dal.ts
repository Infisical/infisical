import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { HEARTBEAT_BUFFER_SECONDS } from "@app/ee/services/gateway-v2/gateway-v2-constants";
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
        legacySecrets,
        v2Secrets,
        environments,
        secretSyncs,
        appConnections,
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
        countTable(db, TableName.SecretV2),
        countTable(db, TableName.Environment),
        countTable(db, TableName.SecretSync),
        countTable(db, TableName.AppConnection),
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

      // Count active gateways from both legacy (Gateway) and V2 (GatewayV2) tables.
      // Legacy gateways heartbeat every ~3 minutes; use a 5-minute window to avoid undercounting.
      // V2 gateways report their own heartbeatTTL; use the same expression as gateway-v2-dal.ts.
      const legacyActiveResult = (
        await db(TableName.Gateway)
          .whereNotNull("heartbeat")
          .whereRaw(`"heartbeat" > NOW() - INTERVAL '5 minutes'`)
          .count()
          .first()
      )?.count as string;

      const v2ActiveResult = (
        await db(TableName.GatewayV2)
          .whereNotNull("heartbeat")
          .whereRaw(
            `COALESCE("heartbeatTTL", 0) > 0 AND "heartbeat" + make_interval(secs => COALESCE("heartbeatTTL", 0) + ${HEARTBEAT_BUFFER_SECONDS}) > NOW()`
          )
          .count()
          .first()
      )?.count as string;

      const activeGateways = parseInt(legacyActiveResult || "0", 10) + parseInt(v2ActiveResult || "0", 10);

      // Merge legacy `secrets` and `secrets_v2` counts. secrets_v2 is the active table;
      // legacy `secrets` only retains rows for projects that haven't been migrated.
      const secrets = legacySecrets + v2Secrets;

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
        appConnections,
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
