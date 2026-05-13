import { OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import {
  AuditLogInfo,
  EventType,
  SecretApprovalEvent,
  TAuditLogServiceFactory
} from "@app/ee/services/audit-log/audit-log-types";
import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayVersion } from "@app/lib/gateway/types";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "../app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TDopplerConnection } from "../app-connection/doppler";
import {
  convertVaultValueToString,
  getHCVaultAuthMounts,
  getHCVaultDatabaseRoles,
  getHCVaultInstanceUrl,
  getHCVaultKubernetesAuthRoles,
  getHCVaultKubernetesRoles,
  getHCVaultLdapRoles,
  getHCVaultSecretsForPaths,
  HCVaultAuthType,
  JsonValue,
  listHCVaultMounts,
  listHCVaultNamespaces,
  listHCVaultPolicies,
  listHCVaultSecretPaths,
  TGatewayDetails,
  THCVaultConnection
} from "../app-connection/hc-vault";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TSecretServiceFactory } from "../secret/secret-service";
import { SecretProtectionType } from "../secret/secret-types";
import { TUserDALFactory } from "../user/user-dal";
import { TExternalMigrationConfigDALFactory } from "./external-migration-config-dal";
import {
  decryptEnvKeyDataFn,
  getDopplerSecrets,
  importVaultDataFn,
  listDopplerConfigs,
  listDopplerEnvironments,
  listDopplerProjects,
  parseEnvKeyDataFn,
  vaultMigrationTransformMappings
} from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import { ExternalMigrationConfigVaultConfigSchema, ExternalMigrationProviders } from "./external-migration-schemas";
import {
  ExternalMigrationImportStatus,
  ExternalPlatforms,
  THasCustomVaultMigrationDTO,
  TImportDopplerSecretsDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO
} from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  secretService: TSecretServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  appConnectionService: Pick<
    TAppConnectionServiceFactory,
    "connectAppConnectionById" | "validateAppConnectionUsageById"
  >;
  externalMigrationConfigDAL: Pick<TExternalMigrationConfigDALFactory, "find" | "findWithConnection" | "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  permissionService,
  externalMigrationQueue,
  userDAL,
  gatewayService,
  gatewayV2Service,
  secretService,
  auditLogService,
  appConnectionService,
  externalMigrationConfigDAL,
  kmsService
}: TExternalMigrationServiceFactoryDep) => {
  const getGatewayDetails = async (connection: THCVaultConnection) => {
    let gatewayDetails: TGatewayDetails | undefined;

    if (connection.gatewayId) {
      const instanceUrl = await getHCVaultInstanceUrl(connection);
      const url = new URL(instanceUrl);

      const [targetHost] = await verifyHostInputValidity({
        host: url.hostname,
        isGateway: true,
        isDynamicSecret: false
      });

      // eslint-disable-next-line no-nested-ternary
      const targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;

      const gatewayV2Details = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
        gatewayId: connection.gatewayId,
        targetHost,
        targetPort
      });

      if (gatewayV2Details) {
        gatewayDetails = {
          gatewayVersion: GatewayVersion.V2,
          details: gatewayV2Details,
          target: {
            host: targetHost,
            port: targetPort
          }
        };
      } else {
        const gatewayV1Details = await gatewayService.fnGetGatewayClientTlsByGatewayId(connection.gatewayId);
        if (gatewayV1Details) {
          gatewayDetails = {
            gatewayVersion: GatewayVersion.V1,
            details: gatewayV1Details,
            target: {
              host: targetHost,
              port: targetPort
            }
          };
        }
      }
    }

    return gatewayDetails;
  };

  // CASL is enforced inside connectAppConnectionById for project- or org-scoped connections.
  const getVaultConnectionById = async (connectionId: string, actor: OrgServiceActor) =>
    appConnectionService.connectAppConnectionById<THCVaultConnection>(AppConnection.HCVault, connectionId, actor);

  const getVaultConnectionForImport = async (connectionId: string, projectId: string, actor: OrgServiceActor) =>
    (await appConnectionService.validateAppConnectionUsageById(
      AppConnection.HCVault,
      { connectionId, projectId },
      actor
    )) as THCVaultConnection;

  // Org-admin only; resolves via the org-level external migration config matched by namespace.
  const getVaultConnectionForNamespace = async (actor: OrgServiceActor, namespace: string, action: string) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: `Only admins can ${action}` });
    }

    const existingConfig = await externalMigrationConfigDAL.findWithConnection({
      orgId: actor.orgId,
      provider: ExternalMigrationProviders.Vault
    });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actor.orgId
    });

    const migrationConfig = existingConfig
      .map((config) => {
        const decryptedConfig = decryptor({ cipherTextBlob: config.encryptedConfig });

        return {
          ...config,
          config: ExternalMigrationConfigVaultConfigSchema.parse(JSON.parse(decryptedConfig.toString()))
        };
      })
      .find((config) => config.config.namespace === namespace);

    if (!migrationConfig) {
      throw new NotFoundError({ message: "Vault migration config not found for this namespace" });
    }

    if (!migrationConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured for this namespace" });
    }

    const credentials = await decryptAppConnectionCredentials({
      orgId: migrationConfig.orgId,
      encryptedCredentials: migrationConfig.connection?.encryptedCredentials,
      kmsService,
      projectId: null
    });

    return {
      ...migrationConfig.connection,
      credentials
    } as THCVaultConnection;
  };

  const resolveVaultConnection = async (
    actor: OrgServiceActor,
    { namespace, connectionId, action }: { namespace: string; connectionId?: string; action: string }
  ) =>
    connectionId
      ? getVaultConnectionById(connectionId, actor)
      : getVaultConnectionForNamespace(actor, namespace, action);

  const importEnvKeyData = async ({
    decryptionKey,
    encryptedJson,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportEnvKeyDataDTO) => {
    if (crypto.isFipsModeEnabled()) {
      throw new BadRequestError({ message: "EnvKey migration is not supported when running in FIPS mode." });
    }

    const { hasRole } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId: actorOrgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.Any
    });
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import data" });
    }

    const user = await userDAL.findById(actorId);
    const json = await decryptEnvKeyDataFn(decryptionKey, encryptedJson);
    const envKeyData = await parseEnvKeyDataFn(json);

    const stringifiedJson = JSON.stringify({
      data: envKeyData,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    });

    const encrypted = crypto.encryption().symmetric().encryptWithRootEncryptionKey(stringifiedJson);

    await externalMigrationQueue.startImport({
      actorId: user.id,
      orgId: actorOrgId,
      actorEmail: user.email!,
      importType: ExternalPlatforms.EnvKey,
      data: {
        ...encrypted
      }
    });
  };

  const importVaultData = async ({
    vaultAccessToken,
    vaultNamespace,
    mappingType,
    vaultUrl,
    gatewayId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportVaultDataDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId: actorOrgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import data" });
    }

    const user = await userDAL.findById(actorId);

    const vaultData = await importVaultDataFn(
      {
        vaultAccessToken,
        vaultNamespace,
        vaultUrl,
        mappingType,
        gatewayId,
        orgId: actorOrgId
      },
      {
        gatewayService,
        gatewayV2Service
      }
    );

    const stringifiedJson = JSON.stringify({
      data: vaultData,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    });

    const encrypted = crypto.encryption().symmetric().encryptWithRootEncryptionKey(stringifiedJson);

    await externalMigrationQueue.startImport({
      actorId: user.id,
      orgId: actorOrgId,
      actorEmail: user.email!,
      importType: ExternalPlatforms.Vault,
      data: {
        ...encrypted
      }
    });
  };

  const hasCustomVaultMigration = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    provider
  }: THasCustomVaultMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId: actorOrgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can check custom migration status" });
    }

    if (provider !== ExternalMigrationProviders.Vault) {
      throw new BadRequestError({
        message: "Invalid provider. Vault is the only supported provider for custom migrations."
      });
    }

    return actorOrgId in vaultMigrationTransformMappings;
  };

  const getVaultNamespaces = async ({ actor, connectionId }: { actor: OrgServiceActor; connectionId?: string }) => {
    if (connectionId) {
      const connection = await getVaultConnectionById(connectionId, actor);
      return listHCVaultNamespaces(connection, gatewayService, gatewayV2Service);
    }

    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault namespaces" });
    }

    // Get all configured namespaces for this org
    const vaultConfigs = await externalMigrationConfigDAL.find({
      orgId: actor.orgId,
      provider: ExternalMigrationProviders.Vault
    });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actor.orgId
    });

    // Return the configured namespaces as an array of objects with id and name
    // where both id and name are the namespace path
    const namespaces = vaultConfigs.map((config) => {
      const decryptedConfig = decryptor({ cipherTextBlob: config.encryptedConfig });

      const parsedConfig = ExternalMigrationConfigVaultConfigSchema.parse(JSON.parse(decryptedConfig.toString()));

      return {
        id: parsedConfig.namespace,
        name: parsedConfig.namespace
      };
    });

    return namespaces;
  };

  const getVaultPolicies = async ({
    actor,
    namespace,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "view vault policies"
    });

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultPolicies(namespace, connection, gatewayService, gatewayV2Service, gatewayDetails);
  };

  const getVaultMounts = async ({
    actor,
    namespace,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "view vault mounts"
    });

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultMounts(connection, gatewayService, gatewayV2Service, namespace, gatewayDetails);
  };

  const getVaultSecretPaths = async ({
    actor,
    namespace,
    mountPath,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "view vault secret paths"
    });

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultSecretPaths(namespace, connection, gatewayService, gatewayV2Service, mountPath, gatewayDetails);
  };

  const importVaultSecrets = async ({
    actor,
    projectId,
    environment,
    secretPath,
    vaultNamespace,
    vaultSecretPaths,
    connectionId,
    auditLogInfo
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    vaultNamespace: string;
    vaultSecretPaths: string[];
    connectionId?: string;
    auditLogInfo: AuditLogInfo;
  }) => {
    const connection = connectionId
      ? await getVaultConnectionForImport(connectionId, projectId, actor)
      : await getVaultConnectionForNamespace(actor, vaultNamespace, "import vault secrets");

    if (!vaultSecretPaths.length) {
      throw new BadRequestError({ message: "At least one Vault secret path is required" });
    }

    const uniqueVaultSecretPaths = Array.from(new Set(vaultSecretPaths));

    const secretsPerPath = await getHCVaultSecretsForPaths(
      vaultNamespace,
      uniqueVaultSecretPaths,
      connection,
      gatewayService,
      gatewayV2Service
    );

    const keyOrigins = new Map<string, string[]>();

    // build a map of secret keys to the paths they appear in
    for (const { vaultSecretPath, secrets } of secretsPerPath) {
      for (const secretKey of Object.keys(secrets)) {
        const paths = keyOrigins.get(secretKey);
        if (paths) {
          paths.push(vaultSecretPath);
        } else {
          keyOrigins.set(secretKey, [vaultSecretPath]);
        }
      }
    }

    const conflicts = [...keyOrigins.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([secretKey, paths]) => `"${secretKey}" (in ${paths.join(", ")})`);

    if (conflicts.length) {
      throw new BadRequestError({
        message: `Cannot import: the following secret keys appear in multiple selected Vault paths: ${conflicts.join("; ")}. Resolve the conflicts in Vault or import the paths separately.`
      });
    }

    const vaultSecrets: Record<string, JsonValue> = {};
    for (const { secrets } of secretsPerPath) {
      Object.assign(vaultSecrets, secrets);
    }

    try {
      const secretOperation = await secretService.createManySecretsRaw({
        actorId: actor.id,
        actor: actor.type,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        secretPath,
        environment,
        projectId,
        secrets: Object.entries(vaultSecrets).map(([secretKey, secretValue]) => ({
          secretKey,
          secretValue: convertVaultValueToString(secretValue)
        }))
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        await auditLogService.createAuditLog({
          projectId,
          ...auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath,
              environment,
              secrets: Object.entries(vaultSecrets).map(([secretKey]) => ({
                secretKey
              })),
              eventType: SecretApprovalEvent.CreateMany
            }
          }
        });

        return { status: ExternalMigrationImportStatus.ApprovalRequired };
      }

      return { status: ExternalMigrationImportStatus.Imported };
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to import Vault secrets. ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  const getVaultAuthMounts = async ({
    actor,
    namespace,
    authType,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    authType?: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "view vault auth mounts"
    });
    return getHCVaultAuthMounts(namespace, authType as HCVaultAuthType, connection, gatewayService, gatewayV2Service);
  };

  const getVaultKubernetesAuthRoles = async ({
    actor,
    namespace,
    mountPath,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "view vault Kubernetes auth roles"
    });
    return getHCVaultKubernetesAuthRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultKubernetesRoles = async ({
    actor,
    namespace,
    mountPath,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "get Kubernetes roles"
    });
    return getHCVaultKubernetesRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultDatabaseRoles = async ({
    actor,
    namespace,
    mountPath,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "get database roles"
    });
    return getHCVaultDatabaseRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultLdapRoles = async ({
    actor,
    namespace,
    mountPath,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
    connectionId?: string;
  }) => {
    const connection = await resolveVaultConnection(actor, {
      namespace,
      connectionId,
      action: "get LDAP roles"
    });
    return getHCVaultLdapRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  // ─── Doppler In-Platform Migration ──────────────────────────────────────────

  // CASL is enforced inside connectAppConnectionById for project- or org-scoped connections.
  const getDopplerConnection = (connectionId: string, actor: OrgServiceActor) =>
    appConnectionService.connectAppConnectionById<TDopplerConnection>(AppConnection.Doppler, connectionId, actor);

  const getDopplerConnectionForImport = (connectionId: string, projectId: string, actor: OrgServiceActor) =>
    appConnectionService.validateAppConnectionUsageById(
      AppConnection.Doppler,
      { connectionId, projectId },
      actor
    ) as Promise<TDopplerConnection>;

  const getDopplerConnectionForConfig = async (configId: string, actor: OrgServiceActor) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can use Doppler migration" });
    }

    const config = await externalMigrationConfigDAL.findById(configId);
    if (!config || config.orgId !== actor.orgId || config.provider !== ExternalMigrationProviders.Doppler) {
      throw new NotFoundError({ message: "Doppler migration config not found" });
    }
    if (!config.connectionId) {
      throw new BadRequestError({ message: "Doppler migration config has no connection configured" });
    }
    return appConnectionService.connectAppConnectionById<TDopplerConnection>(
      AppConnection.Doppler,
      config.connectionId,
      actor
    );
  };

  const resolveDopplerConnection = (
    actor: OrgServiceActor,
    { configId, connectionId }: { configId?: string; connectionId?: string }
  ) => {
    if (connectionId) return getDopplerConnection(connectionId, actor);
    if (configId) return getDopplerConnectionForConfig(configId, actor);
    throw new BadRequestError({ message: "Either connectionId or configId must be provided" });
  };

  const getDopplerProjects = async ({
    configId,
    connectionId,
    actor
  }: {
    configId?: string;
    connectionId?: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await resolveDopplerConnection(actor, { configId, connectionId });
    return listDopplerProjects(appConnection);
  };

  const getDopplerEnvironments = async ({
    configId,
    connectionId,
    projectSlug,
    actor
  }: {
    configId?: string;
    connectionId?: string;
    projectSlug: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await resolveDopplerConnection(actor, { configId, connectionId });
    return listDopplerEnvironments(appConnection, projectSlug);
  };

  const getDopplerConfigs = async ({
    configId,
    connectionId,
    projectSlug,
    actor
  }: {
    configId?: string;
    connectionId?: string;
    projectSlug: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await resolveDopplerConnection(actor, { configId, connectionId });
    return listDopplerConfigs(appConnection, projectSlug);
  };

  const importDopplerSecrets = async ({
    configId,
    connectionId,
    dopplerProject,
    dopplerEnvironment,
    targetProjectId,
    targetEnvironment,
    targetSecretPath,
    actor,
    auditLogInfo
  }: TImportDopplerSecretsDTO) => {
    const appConnection = connectionId
      ? await getDopplerConnectionForImport(connectionId, targetProjectId, actor)
      : await resolveDopplerConnection(actor, { configId });

    const dopplerSecrets = await getDopplerSecrets(appConnection, dopplerProject, dopplerEnvironment);

    try {
      const secretOperation = await secretService.createManySecretsRaw({
        actorId: actor.id,
        actor: actor.type,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        projectId: targetProjectId,
        environment: targetEnvironment,
        secretPath: targetSecretPath,
        secrets: Object.entries(dopplerSecrets).map(([secretKey, secretValue]) => ({
          secretKey,
          secretValue
        }))
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        await auditLogService.createAuditLog({
          projectId: targetProjectId,
          ...auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath: targetSecretPath,
              environment: targetEnvironment,
              secrets: Object.entries(dopplerSecrets).map(([secretKey]) => ({
                secretKey
              })),
              eventType: SecretApprovalEvent.CreateMany
            }
          }
        });

        return { status: ExternalMigrationImportStatus.ApprovalRequired, imported: 0 };
      }
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to import Doppler secrets. ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    return { status: ExternalMigrationImportStatus.Imported, imported: Object.keys(dopplerSecrets).length };
  };

  return {
    importEnvKeyData,
    importVaultData,
    hasCustomVaultMigration,

    getVaultNamespaces,
    getVaultPolicies,
    getVaultMounts,
    getVaultAuthMounts,
    getVaultSecretPaths,
    importVaultSecrets,
    getVaultKubernetesAuthRoles,
    getVaultKubernetesRoles,
    getVaultDatabaseRoles,
    getVaultLdapRoles,

    getDopplerProjects,
    getDopplerEnvironments,
    getDopplerConfigs,
    importDopplerSecrets
  };
};
