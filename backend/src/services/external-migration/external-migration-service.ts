import { MongoAbility, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import {
  AuditLogInfo,
  EventType,
  SecretApprovalEvent,
  TAuditLogServiceFactory
} from "@app/ee/services/audit-log/audit-log-types";
import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayVersion } from "@app/lib/gateway/types";
import { logger } from "@app/lib/logger";
import { recordLegacyRootKeyUsageMetric } from "@app/lib/telemetry/metrics";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection/app-connection-enums";
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
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretServiceFactory } from "../secret/secret-service";
import { SecretProtectionType } from "../secret/secret-types";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderServiceFactory } from "../secret-folder/secret-folder-service";
import { TUserDALFactory } from "../user/user-dal";
import {
  assertVaultFolderImportSecretCount,
  assertVaultPathsWithinMount,
  buildVaultFolderImportPlan,
  decryptEnvKeyDataFn,
  getDopplerSecrets,
  importVaultDataFn,
  listDopplerConfigs,
  listDopplerEnvironments,
  listDopplerProjects,
  parseEnvKeyDataFn,
  TVaultFolderImportUnit,
  vaultMigrationTransformMappings
} from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import { ExternalMigrationProviders } from "./external-migration-schemas";
import {
  ExternalMigrationImportStatus,
  ExternalPlatforms,
  THasCustomVaultMigrationDTO,
  TImportDopplerSecretsDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO,
  TVaultFolderImportResult
} from "./external-migration-types";

const $findFolderPathsDeniedCreate = ({
  permission,
  environment,
  folderPaths
}: {
  permission: MongoAbility<ProjectPermissionSet>;
  environment: string;
  folderPaths: string[];
}) =>
  folderPaths.filter((folderPath) => {
    const parentPath = `/${folderPath.split("/").filter(Boolean).slice(0, -1).join("/")}`;
    return permission.cannot(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretFolders, { environment, secretPath: parentPath })
    );
  });

const $findSecretPathsDeniedCreate = ({
  permission,
  environment,
  units
}: {
  permission: MongoAbility<ProjectPermissionSet>;
  environment: string;
  units: TVaultFolderImportUnit[];
}) =>
  units
    .filter(
      ({ folderPath, secrets }) =>
        secrets.length > 0 &&
        permission.cannot(
          ProjectPermissionSecretActions.Create,
          subject(ProjectPermissionSub.Secrets, { environment, secretPath: folderPath })
        )
    )
    .map(({ folderPath }) => folderPath);

const $assertVaultImportCreatePermissions = ({
  permission,
  environment,
  pathsToCreate,
  units
}: {
  permission: MongoAbility<ProjectPermissionSet>;
  environment: string;
  pathsToCreate: string[];
  units: TVaultFolderImportUnit[];
}) => {
  // both permissions are collected before anything is written, so a partial permission set fails the whole import
  const pathsDeniedFolderCreate = $findFolderPathsDeniedCreate({
    permission,
    environment,
    folderPaths: pathsToCreate
  });
  const pathsDeniedSecretCreate = $findSecretPathsDeniedCreate({ permission, environment, units });

  if (pathsDeniedFolderCreate.length || pathsDeniedSecretCreate.length) {
    const reasons: string[] = [];
    if (pathsDeniedFolderCreate.length) {
      reasons.push(`create folders at ${pathsDeniedFolderCreate.map((el) => `'${el}'`).join(", ")}`);
    }
    if (pathsDeniedSecretCreate.length) {
      reasons.push(`create secrets at ${pathsDeniedSecretCreate.map((el) => `'${el}'`).join(", ")}`);
    }

    throw new ForbiddenRequestError({
      message: `You do not have permission to ${reasons.join(", or to ")} in environment '${environment}'. Nothing was imported.`
    });
  }
};

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  secretService: TSecretServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  appConnectionService: Pick<
    TAppConnectionServiceFactory,
    "connectAppConnectionById" | "validateAppConnectionUsageById"
  >;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  gatewayPoolService: Pick<
    TGatewayPoolServiceFactory,
    "resolveEffectiveGatewayId" | "resolveAttachableGatewayFromPool" | "pickHealthyGateway"
  >;
  folderService: Pick<TSecretFolderServiceFactory, "createManyFolders">;
  folderDAL: Pick<TSecretFolderDALFactory, "transaction" | "findByManySecretPath">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  permissionService,
  externalMigrationQueue,
  userDAL,
  gatewayService,
  gatewayV2Service,
  gatewayDAL,
  gatewayV2DAL,
  gatewayPoolService,
  secretService,
  auditLogService,
  appConnectionService,
  folderService,
  folderDAL,
  projectEnvDAL
}: TExternalMigrationServiceFactoryDep) => {
  const getGatewayDetails = async (connection: THCVaultConnection) => {
    let gatewayDetails: TGatewayDetails | undefined;

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });

    if (effectiveGatewayId) {
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
        gatewayId: effectiveGatewayId,
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
        const gatewayV1Details = await gatewayService.fnGetGatewayClientTlsByGatewayId(effectiveGatewayId);
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

    recordLegacyRootKeyUsageMetric({ operation: "encrypt", surface: "external_migration" });
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
    gatewayPoolId,
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

    if (gatewayId && gatewayPoolId) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }

    let effectiveGatewayId: string | null = gatewayId ?? null;
    if (gatewayId) {
      const [gateway, gatewayV2] = await Promise.all([
        gatewayDAL.find({ id: gatewayId, orgId: actorOrgId }, { limit: 1 }),
        gatewayV2DAL.find({ id: gatewayId, orgId: actorOrgId }, { limit: 1 })
      ]);

      // Ensure gatewayId is part of the actor's org
      if (!gateway.length && !gatewayV2.length) {
        throw new NotFoundError({ message: `Gateway with ID ${gatewayId} not found` });
      }
    }

    if (gatewayPoolId) {
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actorOrgId,
        actor: { type: actor, id: actorId, orgId: actorOrgId, authMethod: actorAuthMethod }
      });
      const picked = await gatewayPoolService.pickHealthyGateway(gatewayPoolId);
      effectiveGatewayId = picked.id;
    }

    const vaultData = await importVaultDataFn(
      {
        vaultAccessToken,
        vaultNamespace,
        vaultUrl,
        mappingType,
        gatewayId: effectiveGatewayId ?? undefined,
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

    recordLegacyRootKeyUsageMetric({ operation: "encrypt", surface: "external_migration" });
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

  const getVaultNamespaces = async ({ actor, connectionId }: { actor: OrgServiceActor; connectionId: string }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
    return listHCVaultNamespaces(connection, gatewayService, gatewayV2Service);
  };

  const getVaultPolicies = async ({
    actor,
    namespace,
    connectionId
  }: {
    actor: OrgServiceActor;
    namespace: string;
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );

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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );

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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );

    const gatewayDetails = await getGatewayDetails(connection);

    return listHCVaultSecretPaths(namespace, connection, gatewayService, gatewayV2Service, mountPath, gatewayDetails);
  };

  const $importVaultSecretsPreservingStructure = async ({
    actor,
    projectId,
    environment,
    secretPath,
    mountPath,
    secretsPerPath,
    auditLogInfo
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    mountPath: string;
    secretsPerPath: { vaultSecretPath: string; secrets: Record<string, JsonValue> }[];
    auditLogInfo: AuditLogInfo;
  }) => {
    const units: TVaultFolderImportUnit[] = buildVaultFolderImportPlan({ secretPath, mountPath, secretsPerPath });
    assertVaultFolderImportSecretCount(units);

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });
    }

    const baseSegments = secretPath.split("/").filter(Boolean);
    const basePath = `/${baseSegments.join("/")}`;

    // every folder between the destination path and each target folder has to exist before secrets land in it
    const candidatePaths: string[] = [];
    const seenCandidatePaths = new Set<string>();
    for (const { folderPath } of units) {
      const segments = folderPath.split("/").filter(Boolean);
      for (let depth = baseSegments.length + 1; depth <= segments.length; depth += 1) {
        const candidatePath = `/${segments.slice(0, depth).join("/")}`;
        if (!seenCandidatePaths.has(candidatePath)) {
          seenCandidatePaths.add(candidatePath);
          candidatePaths.push(candidatePath);
        }
      }
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const unitsWithSecrets = units.filter(({ secrets }) => secrets.length);

    const results = await folderDAL.transaction(async (tx) => {
      const [baseFolder, ...candidateFolders] = await folderDAL.findByManySecretPath(
        [basePath, ...candidatePaths].map((candidatePath) => ({ envId: env.id, secretPath: candidatePath })),
        tx
      );

      if (!baseFolder) {
        throw new NotFoundError({
          message: `Folder with path '${basePath}' in environment with slug '${environment}' not found`
        });
      }

      const pathsToCreate = candidatePaths.filter((_, idx) => !candidateFolders[idx]);

      $assertVaultImportCreatePermissions({
        permission,
        environment,
        pathsToCreate,
        units
      });

      const foldersToCreate = pathsToCreate
        .map((pathToCreate) => {
          const segments = pathToCreate.split("/").filter(Boolean);
          return {
            name: segments[segments.length - 1],
            path: `/${segments.slice(0, -1).join("/")}`,
            environment
          };
        })
        .sort((a, b) => a.path.split("/").filter(Boolean).length - b.path.split("/").filter(Boolean).length);

      const folderEnvironment = { slug: env.slug, name: env.name };
      const folderByPath = new Map<string, { id: string; envId: string; environment: typeof folderEnvironment }>();
      folderByPath.set(basePath, { ...baseFolder, environment: folderEnvironment });
      candidatePaths.forEach((candidatePath, idx) => {
        const existing = candidateFolders[idx];
        if (existing) folderByPath.set(candidatePath, { ...existing, environment: folderEnvironment });
      });

      if (foldersToCreate.length) {
        await folderService.createManyFolders({
          projectId,
          actor: actor.type,
          actorId: actor.id,
          actorAuthMethod: actor.authMethod,
          actorOrgId: actor.orgId,
          folders: foldersToCreate,
          tx
        });

        const createdFolders = await folderDAL.findByManySecretPath(
          pathsToCreate.map((pathToCreate) => ({ envId: env.id, secretPath: pathToCreate })),
          tx
        );
        pathsToCreate.forEach((pathToCreate, idx) => {
          const created = createdFolders[idx];
          if (created) folderByPath.set(pathToCreate, { ...created, environment: folderEnvironment });
        });
      }

      const unitResults: TVaultFolderImportResult[] = [];

      for (const { folderPath, secrets } of unitsWithSecrets) {
        const folder = folderByPath.get(folderPath);
        if (!folder) {
          throw new NotFoundError({
            message: `Folder with path '${folderPath}' in environment with slug '${environment}' not found`
          });
        }

        // eslint-disable-next-line no-await-in-loop
        const secretOperation = await secretService.createManySecretsRaw({
          actorId: actor.id,
          actor: actor.type,
          actorAuthMethod: actor.authMethod,
          actorOrgId: actor.orgId,
          projectId,
          environment,
          secretPath: folderPath,
          folder,
          secrets,
          tx,
          skipPostProcessing: true
        });

        unitResults.push({
          folderPath,
          secrets,
          approval: secretOperation.type === SecretProtectionType.Approval ? secretOperation.approval : undefined
        });
      }

      return unitResults;
    });

    const writtenResults = results.filter(({ approval }) => !approval);
    const approvedResults = results.flatMap(({ folderPath, secrets, approval }) =>
      approval ? [{ folderPath, secrets, approval }] : []
    );

    // the writes have committed; enqueue is the only request-path wait, and a failure here must not
    // report the import as failed
    try {
      await externalMigrationQueue.enqueueVaultImportSideEffects({
        projectId,
        environment,
        environmentName: env.name,
        actor: actor.type,
        actorId: actor.id,
        actorOrgId: actor.orgId,
        auditLogInfo,
        writtenFolders: writtenResults.map(({ folderPath, secrets }) => ({
          folderPath,
          secretKeys: secrets.map(({ secretKey }) => secretKey)
        })),
        approvedFolders: approvedResults.map(({ folderPath, secrets, approval }) => ({
          folderPath,
          secretKeys: secrets.map(({ secretKey }) => secretKey),
          approval: {
            id: approval.id,
            policyId: approval.policyId,
            slug: approval.slug,
            committerUserId: approval.committerUserId,
            commits: (approval.commits as { id: string }[]).map((commit) => ({ id: commit.id }))
          }
        }))
      });
    } catch (error) {
      logger.error(error, `Failed to enqueue Vault import side effects [projectId=${projectId}]`);
    }

    return {
      status: approvedResults.length
        ? ExternalMigrationImportStatus.ApprovalRequired
        : ExternalMigrationImportStatus.Imported,
      importedPaths: writtenResults.map(({ folderPath }) => folderPath),
      approvalRequiredPaths: approvedResults.map(({ folderPath }) => folderPath),
      importedSecretCount: writtenResults.reduce((count, { secrets }) => count + secrets.length, 0),
      approvalRequiredSecretCount: approvedResults.reduce((count, { secrets }) => count + secrets.length, 0)
    };
  };

  const importVaultSecrets = async ({
    actor,
    projectId,
    environment,
    secretPath,
    vaultNamespace,
    mountPath,
    vaultSecretPaths,
    connectionId,
    keepVaultStructure,
    auditLogInfo
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    vaultNamespace: string;
    mountPath: string;
    vaultSecretPaths: string[];
    connectionId: string;
    keepVaultStructure: boolean;
    auditLogInfo: AuditLogInfo;
  }) => {
    const connection = (await appConnectionService.validateAppConnectionUsageById(
      AppConnection.HCVault,
      { connectionId, projectId },
      actor
    )) as THCVaultConnection;

    if (!vaultSecretPaths.length) {
      throw new BadRequestError({ message: "At least one Vault secret path is required" });
    }

    const uniqueVaultSecretPaths = Array.from(new Set(vaultSecretPaths));

    assertVaultPathsWithinMount({ mountPath, vaultSecretPaths: uniqueVaultSecretPaths });

    const secretsPerPath = await getHCVaultSecretsForPaths(
      vaultNamespace,
      mountPath,
      uniqueVaultSecretPaths,
      connection,
      gatewayService,
      gatewayV2Service
    );

    if (keepVaultStructure) {
      return $importVaultSecretsPreservingStructure({
        actor,
        projectId,
        environment,
        secretPath,
        mountPath,
        secretsPerPath,
        auditLogInfo
      });
    }

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

        return {
          status: ExternalMigrationImportStatus.ApprovalRequired,
          importedPaths: [],
          approvalRequiredPaths: [secretPath],
          importedSecretCount: 0,
          approvalRequiredSecretCount: Object.keys(vaultSecrets).length
        };
      }

      return {
        status: ExternalMigrationImportStatus.Imported,
        importedPaths: [secretPath],
        approvalRequiredPaths: [],
        importedSecretCount: Object.keys(vaultSecrets).length,
        approvalRequiredSecretCount: 0
      };
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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
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
    connectionId: string;
  }) => {
    const connection = await appConnectionService.connectAppConnectionById<THCVaultConnection>(
      AppConnection.HCVault,
      connectionId,
      actor
    );
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

  const getDopplerProjects = async ({ connectionId, actor }: { connectionId: string; actor: OrgServiceActor }) => {
    const appConnection = await getDopplerConnection(connectionId, actor);
    return listDopplerProjects(appConnection);
  };

  const getDopplerEnvironments = async ({
    connectionId,
    projectSlug,
    actor
  }: {
    connectionId: string;
    projectSlug: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await getDopplerConnection(connectionId, actor);
    return listDopplerEnvironments(appConnection, projectSlug);
  };

  const getDopplerConfigs = async ({
    connectionId,
    projectSlug,
    actor
  }: {
    connectionId: string;
    projectSlug: string;
    actor: OrgServiceActor;
  }) => {
    const appConnection = await getDopplerConnection(connectionId, actor);
    return listDopplerConfigs(appConnection, projectSlug);
  };

  const importDopplerSecrets = async ({
    connectionId,
    dopplerProject,
    dopplerEnvironment,
    targetProjectId,
    targetEnvironment,
    targetSecretPath,
    actor,
    auditLogInfo
  }: TImportDopplerSecretsDTO) => {
    const appConnection = await getDopplerConnectionForImport(connectionId, targetProjectId, actor);

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
