import { ForbiddenError, MongoAbility, subject } from "@casl/ability";

import { ActionProjectType, SecretType } from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import {
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { OrgServiceActor } from "@app/lib/types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TProxiedServiceCredentialDALFactory } from "./proxied-service-credential-dal";
import { TProxiedServiceDALFactory } from "./proxied-service-dal";
import {
  TCreateProxiedServiceDTO,
  TDeleteProxiedServiceDTO,
  TGetProxiedServiceByIdDTO,
  TGetProxiedServiceByNameDTO,
  TListProxiedServicesDTO,
  TProxiedServiceCredentialInput,
  TProxiedServiceDashboardCountDTO,
  TProxiedServiceDashboardListDTO,
  TUpdateProxiedServiceDTO
} from "./proxied-service-types";

export type TProxiedServiceServiceFactory = ReturnType<typeof proxiedServiceServiceFactory>;

type TProxiedServiceServiceFactoryDep = {
  proxiedServiceDAL: TProxiedServiceDALFactory;
  proxiedServiceCredentialDAL: TProxiedServiceCredentialDALFactory;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "findBySecretPathMultiEnv" | "findSecretPathByFolderIds"
  >;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findBySecretKeys">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

const toCredentialRow = (serviceId: string, credential: TProxiedServiceCredentialInput) => ({
  serviceId,
  secretKey: credential.secretKey,
  role: credential.role,
  headerName: credential.headerName ?? null,
  headerPrefix: credential.headerPrefix ?? null,
  headerPurpose: credential.headerPurpose ?? null,
  placeholderKey: credential.placeholderKey ?? null,
  placeholderValue: credential.placeholderValue ?? null,
  substitutionSurfaces: credential.substitutionSurfaces ?? null
});

export const proxiedServiceServiceFactory = ({
  proxiedServiceDAL,
  proxiedServiceCredentialDAL,
  folderDAL,
  secretV2BridgeDAL,
  permissionService,
  licenseService
}: TProxiedServiceServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use proxied services."
      });
    }
  };

  // Validates every referenced secret exists and that the caller holds ReadValue on it. The check is
  // per-key and tag-aware so a deny rule scoped by secret name or tag can't be bypassed to wire in a
  // secret the caller can't read (the proxy would otherwise broker its value on their behalf).
  const $assertReferencedSecretsReadable = async (
    permission: MongoAbility<ProjectPermissionSet>,
    environment: string,
    secretPath: string,
    folderId: string,
    credentials: TProxiedServiceCredentialInput[]
  ) => {
    const uniqueKeys = [...new Set(credentials.map((c) => c.secretKey))];
    if (!uniqueKeys.length) return;

    const found = await secretV2BridgeDAL.findBySecretKeys(
      folderId,
      uniqueKeys.map((key) => ({ key, type: SecretType.Shared }))
    );
    const tagsByKey = new Map(found.map((s) => [s.key, s.tags?.map((t) => t.slug) ?? []]));

    uniqueKeys.forEach((secretName) => {
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment,
        secretPath,
        secretName,
        secretTags: tagsByKey.get(secretName) ?? []
      });
    });

    const missing = uniqueKeys.filter((key) => !tagsByKey.has(key));
    if (missing.length) {
      throw new BadRequestError({
        message: `Referenced secret(s) not found in folder: ${missing.join(", ")}`
      });
    }
  };

  const $resolveSecretPath = async (projectId: string, folderId: string) => {
    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folderWithPath) {
      throw new NotFoundError({ message: "Could not resolve the folder for this proxied service" });
    }
    return prefixWithSlash(removeTrailingSlash(folderWithPath.path));
  };

  const create = async (
    { projectId, environment, secretPath, name, hostPattern, isEnabled, credentials }: TCreateProxiedServiceDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);
    const canonicalPath = prefixWithSlash(removeTrailingSlash(secretPath));

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProxiedServiceActions.Create,
      subject(ProjectPermissionSub.ProxiedServices, { environment, secretPath: canonicalPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}"`
      });
    }

    await $assertReferencedSecretsReadable(permission, environment, canonicalPath, folder.id, credentials);

    const existing = await proxiedServiceDAL.findOne({ folderId: folder.id, name });
    if (existing) {
      throw new BadRequestError({ message: `A proxied service named "${name}" already exists in this folder` });
    }

    return proxiedServiceDAL.transaction(async (tx) => {
      const service = await proxiedServiceDAL.create(
        { name, hostPattern, isEnabled: isEnabled ?? true, folderId: folder.id },
        tx
      );
      const credentialRows = credentials.map((c) => toCredentialRow(service.id, c));
      const insertedCredentials = credentialRows.length
        ? await proxiedServiceCredentialDAL.insertMany(credentialRows, tx)
        : [];
      return { ...service, credentials: insertedCredentials };
    });
  };

  const list = async ({ projectId, environment, secretPath }: TListProxiedServicesDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    const canonicalPath = prefixWithSlash(removeTrailingSlash(secretPath));

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const scopedSubject = subject(ProjectPermissionSub.ProxiedServices, {
      environment,
      secretPath: canonicalPath
    });
    const canRead = permission.can(ProjectPermissionProxiedServiceActions.Read, scopedSubject);
    const canProxy = permission.can(ProjectPermissionProxiedServiceActions.Proxy, scopedSubject);
    if (!canRead && !canProxy) {
      throw new ForbiddenRequestError({
        message: "You do not have permission to access proxied services in this folder"
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return { services: [] };

    const services = await proxiedServiceDAL.findByFolderIds([folder.id]);
    const credentials = await proxiedServiceCredentialDAL.findByServiceIds(services.map((s) => s.id));
    const credentialsByService = credentials.reduce<Record<string, typeof credentials>>((acc, cred) => {
      acc[cred.serviceId] = acc[cred.serviceId] || [];
      acc[cred.serviceId].push(cred);
      return acc;
    }, {});

    return {
      services: services.map((svc) => ({
        ...svc,
        canProxy,
        credentials: credentialsByService[svc.id] ?? []
      }))
    };
  };

  const getById = async ({ serviceId }: TGetProxiedServiceByIdDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    const service = await proxiedServiceDAL.findByIdWithScope(serviceId);
    if (!service) {
      throw new NotFoundError({ message: `Proxied service with ID "${serviceId}" not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: service.projectId
    });

    const resolvedSecretPath = await $resolveSecretPath(service.projectId, service.folderId);
    const scopedSubject = subject(ProjectPermissionSub.ProxiedServices, {
      environment: service.environmentSlug,
      secretPath: resolvedSecretPath
    });
    const canRead = permission.can(ProjectPermissionProxiedServiceActions.Read, scopedSubject);
    const canProxy = permission.can(ProjectPermissionProxiedServiceActions.Proxy, scopedSubject);
    if (!canRead && !canProxy) {
      throw new ForbiddenRequestError({ message: "You do not have permission to access this proxied service" });
    }

    const credentials = await proxiedServiceCredentialDAL.findByServiceIds([service.id]);
    return { ...service, canProxy, credentials };
  };

  const getByName = async (
    { projectId, environment, secretPath, name }: TGetProxiedServiceByNameDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);
    const canonicalPath = prefixWithSlash(removeTrailingSlash(secretPath));

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const scopedSubject = subject(ProjectPermissionSub.ProxiedServices, {
      environment,
      secretPath: canonicalPath
    });
    const canRead = permission.can(ProjectPermissionProxiedServiceActions.Read, scopedSubject);
    const canProxy = permission.can(ProjectPermissionProxiedServiceActions.Proxy, scopedSubject);
    if (!canRead && !canProxy) {
      throw new ForbiddenRequestError({ message: "You do not have permission to access this proxied service" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({ message: `Proxied service "${name}" not found` });
    }

    const service = await proxiedServiceDAL.findOne({ folderId: folder.id, name });
    if (!service) {
      throw new NotFoundError({ message: `Proxied service "${name}" not found` });
    }

    const credentials = await proxiedServiceCredentialDAL.findByServiceIds([service.id]);
    return { ...service, canProxy, credentials };
  };

  const updateById = async (
    { serviceId, name, hostPattern, isEnabled, credentials }: TUpdateProxiedServiceDTO,
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);
    const service = await proxiedServiceDAL.findByIdWithScope(serviceId);
    if (!service) {
      throw new NotFoundError({ message: `Proxied service with ID "${serviceId}" not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: service.projectId
    });
    const resolvedSecretPath = await $resolveSecretPath(service.projectId, service.folderId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProxiedServiceActions.Edit,
      subject(ProjectPermissionSub.ProxiedServices, {
        environment: service.environmentSlug,
        secretPath: resolvedSecretPath
      })
    );

    if (name && name !== service.name) {
      const conflicting = await proxiedServiceDAL.findOne({ folderId: service.folderId, name });
      if (conflicting) {
        throw new BadRequestError({ message: `A proxied service named "${name}" already exists in this folder` });
      }
    }

    if (credentials) {
      await $assertReferencedSecretsReadable(
        permission,
        service.environmentSlug,
        resolvedSecretPath,
        service.folderId,
        credentials
      );
    }

    const serviceUpdate = {
      ...(name !== undefined ? { name } : {}),
      ...(hostPattern !== undefined ? { hostPattern } : {}),
      ...(isEnabled !== undefined ? { isEnabled } : {})
    };

    return proxiedServiceDAL.transaction(async (tx) => {
      // avoid Knex "Empty .update() call" when only credentials (or nothing) changed
      const updated = Object.keys(serviceUpdate).length
        ? await proxiedServiceDAL.updateById(serviceId, serviceUpdate, tx)
        : await proxiedServiceDAL.findById(serviceId, tx);

      let updatedCredentials;
      if (credentials) {
        await proxiedServiceCredentialDAL.deleteByServiceId(serviceId, tx);
        updatedCredentials = credentials.length
          ? await proxiedServiceCredentialDAL.insertMany(
              credentials.map((c) => toCredentialRow(serviceId, c)),
              tx
            )
          : [];
      } else {
        updatedCredentials = await proxiedServiceCredentialDAL.findByServiceIds([serviceId], tx);
      }

      return {
        ...updated,
        credentials: updatedCredentials,
        projectId: service.projectId,
        environment: service.environmentSlug,
        secretPath: resolvedSecretPath
      };
    });
  };

  const deleteById = async ({ serviceId }: TDeleteProxiedServiceDTO, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    const service = await proxiedServiceDAL.findByIdWithScope(serviceId);
    if (!service) {
      throw new NotFoundError({ message: `Proxied service with ID "${serviceId}" not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId: service.projectId
    });
    const resolvedSecretPath = await $resolveSecretPath(service.projectId, service.folderId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProxiedServiceActions.Delete,
      subject(ProjectPermissionSub.ProxiedServices, {
        environment: service.environmentSlug,
        secretPath: resolvedSecretPath
      })
    );

    await proxiedServiceDAL.deleteById(serviceId);
    const { environmentSlug, ...rest } = service;
    return { ...rest, environment: environmentSlug, secretPath: resolvedSecretPath };
  };

  const getDashboardProxiedServiceCount = async (
    { projectId, environments, secretPath, search }: TProxiedServiceDashboardCountDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretsBrokering) return 0;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const canonicalSecretPath = prefixWithSlash(removeTrailingSlash(secretPath));
    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!folders.length) return 0;

    const allowedFolders = folders.filter((f) =>
      permission.can(
        ProjectPermissionProxiedServiceActions.Read,
        subject(ProjectPermissionSub.ProxiedServices, {
          environment: f.environment.slug,
          secretPath: canonicalSecretPath
        })
      )
    );
    if (!allowedFolders.length) return 0;

    return proxiedServiceDAL.countByFolderIds(
      allowedFolders.map((f) => f.id),
      search
    );
  };

  const getDashboardProxiedServices = async (
    { projectId, environments, secretPath, search, orderDirection, limit, offset }: TProxiedServiceDashboardListDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretsBrokering) return [];

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const canonicalSecretPath = prefixWithSlash(removeTrailingSlash(secretPath));
    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!folders.length) return [];

    const allowedFolders = folders.filter((f) =>
      permission.can(
        ProjectPermissionProxiedServiceActions.Read,
        subject(ProjectPermissionSub.ProxiedServices, {
          environment: f.environment.slug,
          secretPath: canonicalSecretPath
        })
      )
    );
    if (!allowedFolders.length) return [];

    const services = await proxiedServiceDAL.findDashboardByFolderIds({
      folderIds: allowedFolders.map((f) => f.id),
      search,
      limit,
      offset,
      orderDirection
    });

    const credentials = await proxiedServiceCredentialDAL.findByServiceIds(services.map((s) => s.id));
    const credentialsByService = credentials.reduce<Record<string, typeof credentials>>((acc, cred) => {
      acc[cred.serviceId] = acc[cred.serviceId] || [];
      acc[cred.serviceId].push(cred);
      return acc;
    }, {});

    return services.map((svc) => ({
      ...svc,
      folder: { ...svc.folder, path: canonicalSecretPath },
      credentials: credentialsByService[svc.id] ?? []
    }));
  };

  return {
    create,
    list,
    getById,
    getByName,
    updateById,
    deleteById,
    getDashboardProxiedServiceCount,
    getDashboardProxiedServices
  };
};
