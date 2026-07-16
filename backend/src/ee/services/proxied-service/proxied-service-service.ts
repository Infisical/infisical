import { ForbiddenError, MongoAbility, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { OrgServiceActor, TDynamicSecretWithMetadata } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { PersonalOverridesBehavior, SecretImportReferencesBehavior } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { BROKERABLE_DYNAMIC_SECRET_OUTPUTS } from "./proxied-service-brokerable-outputs";
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
    "findBySecretPath" | "findBySecretPathMultiEnv" | "findSecretPathByFolderIds" | "findByManySecretPath"
  >;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "getSecrets">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findWithMetadata">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

const toCredentialRow = (serviceId: string, credential: TProxiedServiceCredentialInput) => ({
  serviceId,
  secretKey: credential.secretKey ?? null,
  role: credential.role,
  headerName: credential.headerName ?? null,
  headerPrefix: credential.headerPrefix ?? null,
  headerPurpose: credential.headerPurpose ?? null,
  placeholderKey: credential.placeholderKey ?? null,
  placeholderValue: credential.placeholderValue ?? null,
  substitutionSurfaces: credential.substitutionSurfaces ?? null,
  dynamicSecretName: credential.dynamicSecretName ?? null,
  dynamicSecretField: credential.dynamicSecretField ?? null
});

type TCredentialRef = {
  secretKey?: string | null;
  dynamicSecretName?: string | null;
  dynamicSecretField?: string | null;
};

export const proxiedServiceServiceFactory = ({
  proxiedServiceDAL,
  proxiedServiceCredentialDAL,
  folderDAL,
  secretV2BridgeService,
  permissionService,
  licenseService,
  dynamicSecretDAL,
  projectDAL
}: TProxiedServiceServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use proxied services."
      });
    }
  };

  // Requires ReadValue (not just DescribeSecret) on each referenced secret: the proxy brokers the value on
  // the caller's behalf, so attaching a secret they can't read would let them exfiltrate it on the wire.
  const $assertReferencedSecretsReadable = async (
    actor: OrgServiceActor,
    projectId: string,
    environment: string,
    secretPath: string,
    credentials: TCredentialRef[]
  ) => {
    const uniqueKeys = [...new Set(credentials.map((c) => c.secretKey).filter((k): k is string => Boolean(k)))];
    if (!uniqueKeys.length) return;

    // viewSecretValue must be true so secretValueHidden reflects real ReadValue access; values are discarded.
    // expandSecretReferences must be true to mirror what the broker fetches at runtime: it resolves each
    // referenced value with expansion on, so the referenced value the broker would send may itself pull in
    // another secret (${OTHER}). Expanding here under the caller's permissions makes getSecrets throw if they
    // can't read a transitively-referenced secret, blocking them from attaching a value they can't fully read.
    const { secrets, imports } = await secretV2BridgeService.getSecrets({
      actor: actor.type,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      projectId,
      environment,
      path: secretPath,
      keys: uniqueKeys,
      includeImports: true,
      recursive: false,
      viewSecretValue: true,
      throwOnMissingReadValuePermission: false,
      expandSecretReferences: true,
      expandPersonalOverrides: false,
      personalOverridesBehavior: PersonalOverridesBehavior.NeverInclude,
      secretImportReferencesBehavior: SecretImportReferencesBehavior.Relative
    });

    // Folder secrets take precedence over imports at resolution time, so a key hidden in the folder is not
    // readable even if an import would expose it. Imports only return keys the caller can read.
    const readableFolderKeys = new Set(secrets.filter((s) => !s.secretValueHidden).map((s) => s.secretKey));
    const describeOnlyFolderKeys = new Set(secrets.filter((s) => s.secretValueHidden).map((s) => s.secretKey));
    const readableImportKeys = new Set(imports.flatMap((group) => group.secrets.map((s) => s.secretKey)));

    const notReadable: string[] = [];
    const notFound: string[] = [];
    uniqueKeys.forEach((key) => {
      if (readableFolderKeys.has(key)) return;
      if (describeOnlyFolderKeys.has(key)) {
        notReadable.push(key);
        return;
      }
      if (readableImportKeys.has(key)) return;
      notFound.push(key);
    });

    if (notReadable.length) {
      throw new ForbiddenRequestError({
        message: `You do not have permission to read the value of secret(s): ${notReadable.join(", ")}`
      });
    }
    if (notFound.length) {
      throw new BadRequestError({
        message: `Referenced secret(s) not found in folder or its imports: ${notFound.join(", ")}`
      });
    }
  };

  const $findReferencedDynamicSecrets = async (folderId: string, credentials: TCredentialRef[]) => {
    const names = [...new Set(credentials.map((c) => c.dynamicSecretName).filter((n): n is string => Boolean(n)))];
    if (!names.length) return { names, byName: new Map<string, TDynamicSecretWithMetadata>() };
    const found = await dynamicSecretDAL.findWithMetadata({ folderId, $in: { name: names } });
    return { names, byName: new Map(found.map((ds) => [ds.name, ds])) };
  };

  const $assertReferencedDynamicSecretsLeasable = async (
    permission: MongoAbility<ProjectPermissionSet>,
    orgId: string,
    projectId: string,
    environment: string,
    secretPath: string,
    folderId: string,
    credentials: TCredentialRef[]
  ) => {
    const dynamicCreds = credentials.filter((c) => Boolean(c.dynamicSecretName));
    if (!dynamicCreds.length) return;

    const plan = await licenseService.getPlan(orgId);
    if (!plan.dynamicSecret) {
      throw new BadRequestError({
        message:
          "Failed to reference a dynamic secret due to plan restriction. Upgrade your plan to use dynamic secrets."
      });
    }

    const { names, byName } = await $findReferencedDynamicSecrets(folderId, dynamicCreds);
    const missing = names.filter((n) => !byName.has(n));
    if (missing.length) {
      throw new BadRequestError({
        message: `Referenced dynamic secret(s) not found in this folder: ${missing.join(", ")}`
      });
    }

    dynamicCreds.forEach((cred) => {
      const ds = byName.get(cred.dynamicSecretName as string) as TDynamicSecretWithMetadata;

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionDynamicSecretActions.Lease,
        subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath, metadata: ds.metadata })
      );

      const brokerableFields = BROKERABLE_DYNAMIC_SECRET_OUTPUTS[ds.type as DynamicSecretProviders];
      if (!brokerableFields) {
        throw new BadRequestError({
          message: `Dynamic secret "${ds.name}" (${ds.type}) can't be brokered over HTTP`
        });
      }
      if (!cred.dynamicSecretField || !brokerableFields.includes(cred.dynamicSecretField)) {
        throw new BadRequestError({
          message: `"${cred.dynamicSecretField}" is not a valid output field for dynamic secret "${ds.name}" (${ds.type}). Allowed: ${brokerableFields.join(", ") || "none"}`
        });
      }
    });
  };

  const $decorateCredentialsWithLeaseAccess = async <T extends TCredentialRef>(
    permission: MongoAbility<ProjectPermissionSet>,
    environment: string,
    secretPath: string,
    folderId: string,
    credentials: T[]
  ): Promise<(T & { callerCanLease?: boolean })[]> => {
    const dynamicCreds = credentials.filter((c) => Boolean(c.dynamicSecretName));
    if (!dynamicCreds.length) return credentials;

    const { byName } = await $findReferencedDynamicSecrets(folderId, dynamicCreds);
    return credentials.map((cred) => {
      if (!cred.dynamicSecretName) return cred;
      const metadata = byName.get(cred.dynamicSecretName)?.metadata ?? [];
      const callerCanLease = permission.can(
        ProjectPermissionDynamicSecretActions.Lease,
        subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath, metadata })
      );
      return { ...cred, callerCanLease };
    });
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

    await $assertReferencedSecretsReadable(actor, projectId, environment, canonicalPath, credentials);
    await $assertReferencedDynamicSecretsLeasable(
      permission,
      actor.orgId,
      projectId,
      environment,
      canonicalPath,
      folder.id,
      credentials
    );

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

    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID "${projectId}" not found` });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return { projectSlug: project.slug, services: [] };

    const services = await proxiedServiceDAL.findByFolderIds([folder.id]);
    const credentials = await proxiedServiceCredentialDAL.findByServiceIds(services.map((s) => s.id));
    const decorated = await $decorateCredentialsWithLeaseAccess(
      permission,
      environment,
      canonicalPath,
      folder.id,
      credentials
    );
    const credentialsByService = decorated.reduce<Record<string, typeof decorated>>((acc, cred) => {
      acc[cred.serviceId] = acc[cred.serviceId] || [];
      acc[cred.serviceId].push(cred);
      return acc;
    }, {});

    return {
      projectSlug: project.slug,
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
    const decorated = await $decorateCredentialsWithLeaseAccess(
      permission,
      service.environmentSlug,
      resolvedSecretPath,
      service.folderId,
      credentials
    );
    return { ...service, canProxy, credentials: decorated };
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
    const decorated = await $decorateCredentialsWithLeaseAccess(
      permission,
      environment,
      canonicalPath,
      folder.id,
      credentials
    );
    return { ...service, canProxy, credentials: decorated };
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

    // Validate the effective credentials on every update, not just when they're being replaced: an editor
    // without ReadValue could otherwise reroute (change hostPattern) or enable a service while retaining
    // credentials they can't read, and have the broker apply those values to a host they control.
    const effectiveCredentials = credentials ?? (await proxiedServiceCredentialDAL.findByServiceIds([service.id]));
    await $assertReferencedSecretsReadable(
      actor,
      service.projectId,
      service.environmentSlug,
      resolvedSecretPath,
      effectiveCredentials
    );
    await $assertReferencedDynamicSecretsLeasable(
      permission,
      actor.orgId,
      service.projectId,
      service.environmentSlug,
      resolvedSecretPath,
      service.folderId,
      effectiveCredentials
    );

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
