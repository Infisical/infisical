import { OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import {
  AuditLogInfo,
  EventType,
  SecretApprovalEvent,
  TAuditLogServiceFactory
} from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "../app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import {
  convertVaultValueToString,
  getHCVaultAuthMounts,
  getHCVaultKubernetesAuthRoles,
  getHCVaultSecretsForPath,
  HCVaultAuthType,
  listHCVaultMounts,
  listHCVaultPolicies,
  listHCVaultSecretPaths,
  THCVaultConnection
} from "../app-connection/hc-vault";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { SecretProtectionType } from "../secret/secret-types";
import { TUserDALFactory } from "../user/user-dal";
import {
  decryptEnvKeyDataFn,
  importVaultDataFn,
  parseEnvKeyDataFn,
  vaultMigrationTransformMappings
} from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import {
  ExternalMigrationProviders,
  ExternalPlatforms,
  TCreateVaultExternalMigrationDTO,
  TDeleteVaultExternalMigrationDTO,
  THasCustomVaultMigrationDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO,
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
    "create" | "findOne" | "transaction" | "find" | "updateById" | "deleteById" | "findById"
  >;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  permissionService,
  externalMigrationQueue,
  userDAL,
  gatewayService,
  secretService,
  auditLogService,
  appConnectionService,
  vaultExternalMigrationConfigDAL,
  kmsService
}: TExternalMigrationServiceFactoryDep) => {
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

    try {
      await listHCVaultPolicies(namespace, connection, gatewayService);
      await getHCVaultAuthMounts(namespace, HCVaultAuthType.Kubernetes, connection, gatewayService);

      const mounts = await listHCVaultMounts(connection, gatewayService);
      const sampleKvMount = mounts.find((mount) => mount.type === "kv");
      if (sampleKvMount) {
        await listHCVaultSecretPaths(namespace, connection, gatewayService, sampleKvMount.path);
      }
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to establish namespace confiugration. ${error instanceof Error ? error.message : "Unknown error"}`
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
        orgId: actor.orgId
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
      orgId: actor.orgId
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
      orgId: actor.orgId
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
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault policies" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    const policies = await listHCVaultPolicies(namespace, connection, gatewayService);
    return policies;
  };

  const getVaultMounts = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault mounts" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    const mounts = await listHCVaultMounts(connection, gatewayService, namespace);
    return mounts;
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
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault secret paths" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    const secretPaths = await listHCVaultSecretPaths(namespace, connection, gatewayService, mountPath);

    return secretPaths;
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
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import vault secrets" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace: vaultNamespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    const vaultSecrets = await getHCVaultSecretsForPath(vaultNamespace, vaultSecretPath, connection, gatewayService);

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
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault auth mounts" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    const authMounts = await getHCVaultAuthMounts(namespace, authType as HCVaultAuthType, connection, gatewayService);

    return authMounts;
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
    const { hasRole } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault Kubernetes auth roles" });
    }

    const vaultConfig = await vaultExternalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      namespace
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

    const connection = {
      ...vaultConfig.connection,
      credentials
    } as THCVaultConnection;

    // Get roles for the specified mount path only
    const roles = await getHCVaultKubernetesAuthRoles(namespace, mountPath, connection, gatewayService);

    return roles;
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
    getVaultKubernetesAuthRoles
  };
};
