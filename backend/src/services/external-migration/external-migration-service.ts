import { OrgMembershipRole } from "@app/db/schemas";
import {
  AuditLogInfo,
  EventType,
  SecretApprovalEvent,
  TAuditLogServiceFactory
} from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "../app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import {
  getHCVaultAuthMounts,
  getHCVaultKubernetesAuthRoles,
  getHCVaultSecretsForPath,
  HCVaultAuthType,
  listHCVaultMounts,
  listHCVaultNamespaces,
  listHCVaultPolicies,
  listHCVaultSecretPaths,
  THCVaultConnection
} from "../app-connection/hc-vault";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { SecretProtectionType } from "../secret/secret-types";
import { TUserDALFactory } from "../user/user-dal";
import { TExternalMigrationConfigDALFactory } from "./external-migration-config-dal";
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
  TConfigureExternalMigrationDTO,
  THasCustomVaultMigrationDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO,
  VaultImportStatus
} from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  secretService: TSecretServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  externalMigrationConfigDAL: Pick<TExternalMigrationConfigDALFactory, "create" | "upsert" | "findOne" | "transaction">;
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
  externalMigrationConfigDAL,
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

    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
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
    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

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
    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

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

  const configureExternalMigration = async ({ platform, connectionId, actor }: TConfigureExternalMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can configure external migration" });
    }

    if (connectionId) {
      if (platform === ExternalMigrationProviders.Vault) {
        await appConnectionService.connectAppConnectionById(AppConnection.HCVault, connectionId, actor);
      } else {
        throw new BadRequestError({ message: "Invalid platform" });
      }
    }

    const config = await externalMigrationConfigDAL.upsert({
      platform,
      connectionId,
      orgId: actor.orgId
    });

    return config;
  };

  const getExternalMigrationConfig = async ({ platform, actor }: { platform: string; actor: OrgServiceActor }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view external migration config" });
    }

    const config = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform
    });

    if (!config) {
      throw new NotFoundError({ message: "External migration config not found" });
    }

    return config;
  };

  const getVaultNamespaces = async ({ actor }: { actor: OrgServiceActor }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault namespaces" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new BadRequestError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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

    const namespaces = await listHCVaultNamespaces(connection, gatewayService);
    return namespaces;
  };

  const getVaultPolicies = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault policies" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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

  const getVaultMounts = async ({ actor, namespace }: { actor: OrgServiceActor; namespace?: string }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault mounts" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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

  const getVaultSecretPaths = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault secret paths" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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

    const secretPaths = await listHCVaultSecretPaths(namespace, connection, gatewayService);

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
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import vault secrets" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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
          secretValue
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

  const getVaultKubernetesAuthRoles = async ({ actor, namespace }: { actor: OrgServiceActor; namespace: string }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can view vault Kubernetes auth roles" });
    }

    const vaultConfig = await externalMigrationConfigDAL.findOne({
      orgId: actor.orgId,
      platform: ExternalMigrationProviders.Vault
    });

    if (!vaultConfig) {
      throw new NotFoundError({ message: "Vault migration config not found" });
    }

    if (!vaultConfig.connection) {
      throw new BadRequestError({ message: "Vault migration connection is not configured" });
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

    // Get all Kubernetes auth mounts for this namespace
    const authMounts = await getHCVaultAuthMounts(namespace, HCVaultAuthType.Kubernetes, connection, gatewayService);

    // For each mount, get all roles with their configuration
    const allRolesPromises = authMounts.map(async (mount) => {
      const roles = await getHCVaultKubernetesAuthRoles(namespace, mount.path, connection, gatewayService);
      return roles;
    });

    const rolesPerMount = await Promise.all(allRolesPromises);

    return rolesPerMount.flat();
  };

  return {
    importEnvKeyData,
    importVaultData,
    hasCustomVaultMigration,
    configureExternalMigration,
    getExternalMigrationConfig,
    getVaultNamespaces,
    getVaultPolicies,
    getVaultMounts,
    getVaultSecretPaths,
    importVaultSecrets,
    getVaultKubernetesAuthRoles
  };
};
