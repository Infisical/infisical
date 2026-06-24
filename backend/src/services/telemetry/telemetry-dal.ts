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

      // Merge legacy `secrets` and `secrets_v2` counts. secrets_v2 is the active table;
      // legacy `secrets` only retains rows for projects that haven't been migrated.
      const secrets = legacySecrets + v2Secrets;

      // Integration type breakdown
      const integrationTypeRows = (await db(TableName.Integration)
        .select("integration")
        .count("* as count")
        .groupBy("integration")) as unknown as { integration: string; count: string }[];
      const integrationBreakdown: Record<string, number> = {};
      for (const row of integrationTypeRows) {
        integrationBreakdown[row.integration] = parseInt(String(row.count), 10);
      }

      // Project type breakdown
      const projectTypeRows = (await db(TableName.Project)
        .select("type")
        .count("* as count")
        .groupBy("type")) as unknown as { type: string; count: string }[];
      const projectTypeBreakdown: Record<string, number> = {};
      for (const row of projectTypeRows) {
        projectTypeBreakdown[row.type] = parseInt(String(row.count), 10);
      }

      // Secret sync destination breakdown
      const syncDestinationRows = (await db(TableName.SecretSync)
        .select("destination")
        .count("* as count")
        .groupBy("destination")) as unknown as { destination: string; count: string }[];
      const secretSyncBreakdown: Record<string, number> = {};
      for (const row of syncDestinationRows) {
        secretSyncBreakdown[row.destination] = parseInt(String(row.count), 10);
      }

      // Per-org breakdown: orgId, name, user count, project count
      const organizationRows = await db(TableName.Organization).select("id", "name");
      const organizations = organizationRows.length;

      const orgUserRows = (await db(TableName.Membership)
        .select("scopeOrgId")
        .count("* as count")
        .where({ scope: AccessScope.Organization, status: "accepted" })
        .whereNotNull("actorUserId")
        .groupBy("scopeOrgId")) as unknown as { scopeOrgId: string; count: string }[];
      const orgUserMap = new Map(orgUserRows.map((r) => [r.scopeOrgId, parseInt(String(r.count), 10)]));

      const orgProjectRows = (await db(TableName.Project)
        .select("orgId")
        .count("* as count")
        .groupBy("orgId")) as unknown as { orgId: string; count: string }[];
      const orgProjectMap = new Map(orgProjectRows.map((r) => [r.orgId, parseInt(String(r.count), 10)]));

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
        organizationNames: organizationRows.map(({ name }) => name),
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
