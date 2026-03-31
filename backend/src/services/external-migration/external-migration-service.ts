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
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
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
  getHCVaultPolicyNames,
  getHCVaultSecretsForPath,
  HCVaultAuthType,
  listHCVaultMounts,
  listHCVaultPolicies,
  listHCVaultSecretPaths,
  TGatewayDetails,
  THCVaultConnection
} from "../app-connection/hc-vault";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { SecretProtectionType } from "../secret/secret-types";
import { TUserDALFactory } from "../user/user-dal";
import {
  decryptEnvKeyDataFn,
  getDopplerSecrets,
  importVaultDataFn,
  listDopplerEnvironments,
  listDopplerProjects,
  parseEnvKeyDataFn,
  vaultMigrationTransformMappings
} from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import {
  ExternalMigrationProviders,
  ExternalPlatforms,
  TCreateDopplerExternalMigrationDTO,
  TCreateVaultExternalMigrationDTO,
  TDeleteDopplerExternalMigrationDTO,
  TDeleteVaultExternalMigrationDTO,
  THasCustomVaultMigrationDTO,
  TImportDopplerSecretsDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO,
  TUpdateDopplerExternalMigrationDTO,
  TUpdateVaultExternalMigrationDTO,
  VaultImportStatus
} from "./external-migration-types";
import { TVaultExternalMigrationConfigDALFactory } from "./vault-external-migration-config-dal";

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  secretService: TSecretServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  vaultExternalMigrationConfigDAL: Pick<
    TVaultExternalMigrationConfigDALFactory,
    "create" | "findOne" | "transaction" | "find" | "updateById" | "deleteById" | "findById" | "findWithConnection"
  >;
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
  vaultExternalMigrationConfigDAL,
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

  // Helper to verify admin permissions and get vault connection
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

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace,
      provider: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found for this namespace" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured for this namespace" });
    }

    const credentials = await decryptAppConnectionCredentials({
      orgId: vaultConfig.orgId,
      encryptedCredentials: vaultConfig.connection.encryptedCredentials,
      kmsService,
      projectId: null
    });

    return {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;
  };

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
        gatewayService
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

  const validateVaultExternalMigrationConnection = async ({
    connection,
    namespace
  }: {
    connection: THCVaultConnection;
    namespace: string;
  }) => {
    // Allow root namespace access when no namespace is configured on the connection
    const isRootAccess = namespace === "root" || namespace === "/";
    const hasNoNamespace = connection.credentials.namespace === undefined;

    if (hasNoNamespace && isRootAccess) {
      // Skip validation for root access with no configured namespace
    } else if (connection.credentials.namespace !== namespace) {
      throw new BadRequestError({ message: "Namespace value does not match the namespace of the connection" });
    }

    const gatewayDetails = await getGatewayDetails(connection);

    try {
      await getHCVaultPolicyNames(namespace, connection, gatewayService, gatewayV2Service, gatewayDetails);
      await getHCVaultAuthMounts(
        namespace,
        HCVaultAuthType.Kubernetes,
        connection,
        gatewayService,
        gatewayV2Service,
        gatewayDetails
      );

      await listHCVaultMounts(connection, gatewayService, gatewayV2Service);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to establish namespace configuration. ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  const createVaultExternalMigration = async ({ namespace, connectionId, actor }: TCreateVaultExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can configure vault external migration" });
    }

    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );

    await validateVaultExternalMigrationConnection({
      connection,
      namespace
    });

    try {
      const config = await vaultExternalMigrationConfigDAL.create({
        namespace,
        connectionId,
        orgId: actor.orgId,
        provider: ExternalMigrationProviders.Vault
      });

      return config;
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        (error.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({
          message: `Vault external migration already exists for this namespace`
        });
      }

      throw error;
    }
  };

  const updateVaultExternalMigration = async ({
    id,
    namespace,
    connectionId,
    actor
  }: TUpdateVaultExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can update vault external migration" });
    }

    const existing = await vaultExternalMigrationConfigDAL.findById(id);
    if (!existing || existing.orgId !== actor.orgId) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }
    if (existing.provider !== ExternalMigrationProviders.Vault) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (connectionId) {
      const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
        AppConnection.HCVault,
        connectionId,
        actor
      );

      await validateVaultExternalMigrationConnection({
        connection,
        namespace
      });
    }

    const config = await vaultExternalMigrationConfigDAL.updateById(id, {
      namespace,
      connectionId
    });

    return config;
  };

  const getVaultExternalMigrationConfigs = async ({ actor }: { actor: OrgServiceActor }) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault external migration configs" });
    }

    const configs = await vaultExternalMigrationConfigDAL.find({
      orgId: actor.orgId,
      provider: ExternalMigrationProviders.Vault
    });

    return configs;
  };

  const getVaultNamespaces = async ({ actor }: { actor: OrgServiceActor }) => {
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
    const vaultConfigs = await vaultExternalMigrationConfigDAL.find({
      orgId: actor.orgId,
      provider: ExternalMigrationProviders.Vault
    });

    // Return the configured namespaces as an array of objects with id and name
    // where both id and name are the namespace path
    const namespaces = vaultConfigs.map((config) => ({
      id: config.namespace,
      name: config.namespace
    }));

    return namespaces;
  };

  const getVaultPolicies = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "view vault policies");

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultPolicies(namespace, connection, gatewayService, gatewayV2Service, gatewayDetails);
  };

  const getVaultMounts = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "view vault mounts");

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultMounts(connection, gatewayService, gatewayV2Service, namespace, gatewayDetails);
  };

  const getVaultSecretPaths = async ({
    actor,
    namespace,
    mountPath
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "view vault secret paths");

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultSecretPaths(namespace, connection, gatewayService, gatewayV2Service, mountPath, gatewayDetails);
  };

  const importVaultSecrets = async ({
    actor,
    projectId,
    environment,
    secretPath,
    vaultNamespace,
    vaultSecretPath,
    auditLogInfo
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    vaultNamespace: string;
    vaultSecretPath: string;
    auditLogInfo: AuditLogInfo;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, vaultNamespace, "import vault secrets");
    const vaultSecrets = await getHCVaultSecretsForPath(
      vaultNamespace,
      vaultSecretPath,
      connection,
      gatewayService,
      gatewayV2Service
    );

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

        return { status: VaultImportStatus.ApprovalRequired };
      }

      return { status: VaultImportStatus.Imported };
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to import Vault secrets. ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  const deleteVaultExternalMigration = async ({ id, actor }: TDeleteVaultExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can delete vault external migration configs" });
    }

    const config = await vaultExternalMigrationConfigDAL.findById(id);

    if (!config) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (config.orgId !== actor.orgId) {
      throw new ForbiddenRequestError({ message: "Config does not belong to this organization" });
    }

    if (config.provider !== ExternalMigrationProviders.Vault) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    const deletedConfig = await vaultExternalMigrationConfigDAL.deleteById(id);

    return deletedConfig;
  };

  const getVaultAuthMounts = async ({
    actor,
    namespace,
    authType
  }: {
    actor: OrgServiceActor;
    namespace: string;
    authType?: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "view vault auth mounts");
    return getHCVaultAuthMounts(namespace, authType as HCVaultAuthType, connection, gatewayService, gatewayV2Service);
  };

  const getVaultKubernetesAuthRoles = async ({
    actor,
    namespace,
    mountPath
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "view vault Kubernetes auth roles");
    return getHCVaultKubernetesAuthRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultKubernetesRoles = async ({
    actor,
    namespace,
    mountPath
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "get Kubernetes roles");
    return getHCVaultKubernetesRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultDatabaseRoles = async ({
    actor,
    namespace,
    mountPath
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "get database roles");
    return getHCVaultDatabaseRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  const getVaultLdapRoles = async ({
    actor,
    namespace,
    mountPath
  }: {
    actor: OrgServiceActor;
    namespace: string;
    mountPath: string;
  }) => {
    const connection = await getVaultConnectionForNamespace(actor, namespace, "get LDAP roles");
    return getHCVaultLdapRoles(namespace, mountPath, connection, gatewayService, gatewayV2Service);
  };

  // ─── Doppler In-Platform Migration ──────────────────────────────────────────

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

    const config = await vaultExternalMigrationConfigDAL.findById(configId);

    if (!config || config.orgId !== actor.orgId || config.provider !== ExternalMigrationProviders.Doppler) {
      throw new NotFoundError({ message: "Doppler migration config not found" });
    }

    if (!config.connectionId) {
      throw new BadRequestError({ message: "Doppler migration config has no connection configured" });
    }

    const appConnection = await appConnectionService.connectAppConnectionById<TDopplerConnection>(
      AppConnection.Doppler,
      config.connectionId,
      actor
    );

    return appConnection;
  };

  const createDopplerExternalMigration = async ({ connectionId, actor }: TCreateDopplerExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can create Doppler migration configs" });
    }

    try {
      const config = await vaultExternalMigrationConfigDAL.create({
        orgId: actor.orgId,
        connectionId,
        provider: ExternalMigrationProviders.Doppler,
        namespace: null
      });

      return config;
    } catch (error) {
      if (error instanceof DatabaseError && error.error && "code" in (error.error as object)) {
        const dbError = error.error as { code: string };
        if (dbError.code === DatabaseErrorCode.UniqueViolation) {
          throw new BadRequestError({ message: "A Doppler migration config already exists for this connection" });
        }
      }
      throw error;
    }
  };

  const getDopplerExternalMigrationConfigs = async (actor: OrgServiceActor) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view Doppler migration configs" });
    }

    return vaultExternalMigrationConfigDAL.findWithConnection({
      orgId: actor.orgId,
      provider: ExternalMigrationProviders.Doppler
    });
  };

  const updateDopplerExternalMigration = async ({
    id,
    connectionId,
    actor
  }: TUpdateDopplerExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can update Doppler migration configs" });
    }

    const config = await vaultExternalMigrationConfigDAL.findById(id);

    if (!config || config.orgId !== actor.orgId || config.provider !== ExternalMigrationProviders.Doppler) {
      throw new NotFoundError({ message: "Doppler migration config not found" });
    }

    if (connectionId) {
      await appConnectionService.connectAppConnectionById(AppConnection.Doppler, connectionId, actor);
    }

    return vaultExternalMigrationConfigDAL.updateById(id, { connectionId });
  };

  const deleteDopplerExternalMigration = async ({ id, actor }: TDeleteDopplerExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can delete Doppler migration configs" });
    }

    const config = await vaultExternalMigrationConfigDAL.findById(id);

    if (!config || config.orgId !== actor.orgId || config.provider !== ExternalMigrationProviders.Doppler) {
      throw new NotFoundError({ message: "Doppler migration config not found" });
    }

    return vaultExternalMigrationConfigDAL.deleteById(id);
  };

  const getDopplerProjects = async ({ configId, actor }: { configId: string; actor: OrgServiceActor }) => {
    const appConnection = await getDopplerConnectionForConfig(configId, actor);
    return listDopplerProjects(appConnection);
  };

  const getDopplerEnvironments = async ({
    configId,
    projectSlug,
    actor
  }: {
    configId: string;
    projectSlug: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await getDopplerConnectionForConfig(configId, actor);
    return listDopplerEnvironments(appConnection, projectSlug);
  };

  const importDopplerSecrets = async ({
    configId,
    dopplerProject,
    dopplerEnvironment,
    targetProjectId,
    targetEnvironment,
    targetSecretPath,
    actor
  }: TImportDopplerSecretsDTO) => {
    const appConnection = await getDopplerConnectionForConfig(configId, actor);

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
        return { status: VaultImportStatus.ApprovalRequired, imported: 0 };
      }
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to import Doppler secrets. ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }

    return { status: VaultImportStatus.Imported, imported: Object.keys(dopplerSecrets).length };
  };

  return {
    importEnvKeyData,
    importVaultData,
    hasCustomVaultMigration,
    createVaultExternalMigration,
    getVaultExternalMigrationConfigs,
    updateVaultExternalMigration,
    deleteVaultExternalMigration,
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
    createDopplerExternalMigration,
    getDopplerExternalMigrationConfigs,
    updateDopplerExternalMigration,
    deleteDopplerExternalMigration,
    getDopplerProjects,
    getDopplerEnvironments,
    importDopplerSecrets
  };
};
