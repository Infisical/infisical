import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { HEARTBEAT_BUFFER_SECONDS } from "@app/ee/services/gateway-v2/gateway-v2-constants";
import { DatabaseError } from "@app/lib/errors";

const BUILT_IN_ROLE_SLUGS = [...Object.values(OrgMembershipRole), ...Object.values(ProjectMembershipRole)] as string[];

export type TTelemetryDALFactory = ReturnType<typeof telemetryDALFactory>;

const IDENTITY_AUTH_TABLE_MAP: Record<string, string> = {
  "universal-auth": TableName.IdentityUniversalAuth,
  "token-auth": TableName.IdentityTokenAuth,
  "kubernetes-auth": TableName.IdentityKubernetesAuth,
  "gcp-auth": TableName.IdentityGcpAuth,
  "aws-auth": TableName.IdentityAwsAuth,
  "azure-auth": TableName.IdentityAzureAuth,
  "oci-auth": TableName.IdentityOciAuth,
  "oidc-auth": TableName.IdentityOidcAuth,
  "jwt-auth": TableName.IdentityJwtAuth,
  "ldap-auth": TableName.IdentityLdapAuth,
  "alicloud-auth": TableName.IdentityAliCloudAuth,
  "tls-cert-auth": TableName.IdentityTlsCertAuth,
  "spiffe-auth": TableName.IdentitySpiffeAuth
};

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
        secretApprovalPolicies,
        // new counts
        samlConfigs,
        oidcConfigs,
        ldapConfigs,
        scimTokens,
        auditLogStreams,
        secretRotations,
        webhooks,
        customProjectRoles,
        customOrgRoles,
        kmipClients,
        sshHosts,
        sshCertificateAuthorities,
        sshCertificates,
        pamResources,
        pamAccounts,
        accessApprovalPolicies,
        honeyTokens
      ] = await Promise.all([
        (async () => {
          const result = (await db(TableName.Users).where({ isGhost: false }).count().first())?.count as string;
          return parseInt(result || "0", 10);
        })(),
        countTable(db, TableName.Identity),
        countTable(db, TableName.Project),
        countTable(db, TableName.Secret),
        countTable(db, TableName.SecretV2),
        (async () => {
          const result = (await db(TableName.Environment).whereNull("deleteAfter").count().first())?.count as string;
          return parseInt(result || "0", 10);
        })(),
        countTable(db, TableName.SecretSync),
        countTable(db, TableName.AppConnection),
        countTable(db, TableName.Integration),
        countTable(db, TableName.CertificateAuthority),
        countTable(db, TableName.Certificate),
        countTable(db, TableName.DynamicSecret),
        countTable(db, TableName.Groups),
        countTable(db, TableName.SecretApprovalPolicy),
        // new counts
        countTable(db, TableName.SamlConfig),
        countTable(db, TableName.OidcConfig),
        countTable(db, TableName.LdapConfig),
        countTable(db, TableName.ScimToken),
        countTable(db, TableName.AuditLogStream),
        countTable(db, TableName.SecretRotationV2),
        countTable(db, TableName.Webhook),
        (async () => {
          const result = (
            await db(TableName.Role).whereNotNull("projectId").whereNotIn("slug", BUILT_IN_ROLE_SLUGS).count().first()
          )?.count as string;
          return parseInt(result || "0", 10);
        })(),
        (async () => {
          const result = (
            await db(TableName.Role).whereNull("projectId").whereNotIn("slug", BUILT_IN_ROLE_SLUGS).count().first()
          )?.count as string;
          return parseInt(result || "0", 10);
        })(),
        countTable(db, TableName.KmipClient),
        countTable(db, TableName.SshHost),
        countTable(db, TableName.SshCertificateAuthority),
        countTable(db, TableName.SshCertificate),
        countTable(db, TableName.PamResource),
        countTable(db, TableName.PamAccount),
        countTable(db, TableName.AccessApprovalPolicy),
        countTable(db, TableName.HoneyToken)
      ]);

      // Per-type identity auth method breakdown
      const identityAuthMethodEntries = Object.entries(IDENTITY_AUTH_TABLE_MAP);
      const identityAuthMethodsResult = await db.raw<{ rows: { count: string }[] }>(
        identityAuthMethodEntries.map(([, table]) => `SELECT COUNT(*)::text AS count FROM ${table}`).join(" UNION ALL ")
      );
      const identityAuthMethodBreakdown: Record<string, number> = {};
      let identityAuthMethods = 0;
      identityAuthMethodsResult.rows.forEach((row: { count: string }, idx: number) => {
        const count = parseInt(row.count || "0", 10);
        identityAuthMethods += count;
        if (count > 0) {
          identityAuthMethodBreakdown[identityAuthMethodEntries[idx][0]] = count;
        }
      });

      // Count active gateways from both legacy (Gateway) and V2 (GatewayV2) tables.
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

      const secrets = legacySecrets + v2Secrets;

      // Integration type breakdown
      const integrationTypeResult = await db.raw<{ rows: { integration: string; count: string }[] }>(
        `SELECT integration, COUNT(*)::text AS count FROM ${TableName.Integration} GROUP BY integration`
      );
      const integrationBreakdown: Record<string, number> = {};
      for (const row of integrationTypeResult.rows) {
        integrationBreakdown[row.integration] = parseInt(row.count, 10);
      }

      // Project type breakdown
      const projectTypeResult = await db.raw<{ rows: { type: string; count: string }[] }>(
        `SELECT type, COUNT(*)::text AS count FROM ${TableName.Project} GROUP BY type`
      );
      const projectTypeBreakdown: Record<string, number> = {};
      for (const row of projectTypeResult.rows) {
        projectTypeBreakdown[row.type] = parseInt(row.count, 10);
      }

      // Secret sync destination breakdown
      const syncDestinationResult = await db.raw<{ rows: { destination: string; count: string }[] }>(
        `SELECT destination, COUNT(*)::text AS count FROM ${TableName.SecretSync} GROUP BY destination`
      );
      const secretSyncBreakdown: Record<string, number> = {};
      for (const row of syncDestinationResult.rows) {
        secretSyncBreakdown[row.destination] = parseInt(row.count, 10);
      }

      // Per-org breakdown: orgId, name, user count, project count
      const organizationRows = await db(TableName.Organization).select("id", "name");
      const organizations = organizationRows.length;
      const organizationNames = organizationRows.map(({ name }) => name);

      const orgUserResult = await db.raw<{ rows: { scopeOrgId: string; count: string }[] }>(
        `SELECT "scopeOrgId", COUNT(*)::text AS count FROM ${TableName.Membership} WHERE scope = '${AccessScope.Organization}' AND "actorUserId" IS NOT NULL AND status = 'accepted' GROUP BY "scopeOrgId"`
      );
      const orgUserMap = new Map(orgUserResult.rows.map((r) => [r.scopeOrgId, parseInt(r.count, 10)]));

      const orgProjectResult = await db.raw<{ rows: { orgId: string; count: string }[] }>(
        `SELECT "orgId", COUNT(*)::text AS count FROM ${TableName.Project} GROUP BY "orgId"`
      );
      const orgProjectMap = new Map(orgProjectResult.rows.map((r) => [r.orgId, parseInt(r.count, 10)]));

      const organizationBreakdown = organizationRows.map((org) => ({
        orgId: org.id,
        name: org.name,
        users: orgUserMap.get(org.id) ?? 0,
        projects: orgProjectMap.get(org.id) ?? 0
      }));

      return {
        users,
        identities,
        projects,
        secrets,
        organizations,
        organizationNames,
        environments,
        secretSyncs,
        appConnections,
        integrations,
        certificateAuthorities,
        certificates,
        dynamicSecrets,
        identityAuthMethods,
        identityAuthMethodBreakdown,
        groups,
        secretApprovalPolicies,
        activeGateways,
        samlConfigs,
        oidcConfigs,
        ldapConfigs,
        scimTokens,
        auditLogStreams,
        secretRotations,
        webhooks,
        customProjectRoles,
        customOrgRoles,
        kmipClients,
        sshHosts,
        sshCertificateAuthorities,
        sshCertificates,
        pamResources,
        pamAccounts,
        accessApprovalPolicies,
        honeyTokens,
        integrationBreakdown,
        projectTypeBreakdown,
        secretSyncBreakdown,
        organizationBreakdown
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "TelemetryInstanceStats" });
    }
  };

  return { getTelemetryInstanceStats };
};
