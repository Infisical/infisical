import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionProjectFolderGrantActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { prefixWithSlash } from "@app/lib/fn";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TProjectFolderGrantDALFactory } from "./project-folder-grant-dal";
import { TCrossProjectSecretSharingServiceFactory } from "./project-folder-grant-fns";
import {
  TCreateProjectFolderGrantDTO,
  TDeleteProjectFolderGrantDTO,
  TGetGrantUsageDTO,
  TListProjectFolderGrantsDTO,
  TListProjectFolderGrantsForTargetDTO
} from "./project-folder-grant-types";

export type TProjectFolderGrantServiceFactory = ReturnType<typeof projectFolderGrantServiceFactory>;

const normalizeSecretPath = (secretPath: string) => prefixWithSlash(secretPath.split("/").filter(Boolean).join("/"));

type TProjectFolderGrantServiceFactoryDep = {
  projectFolderGrantDAL: TProjectFolderGrantDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findById" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId">;
  crossProjectSecretSharingService: Pick<TCrossProjectSecretSharingServiceFactory, "isCrossProjectEnabled">;
};

export const projectFolderGrantServiceFactory = ({
  projectFolderGrantDAL,
  folderDAL,
  projectDAL,
  orgDAL,
  permissionService,
  secretV2BridgeDAL,
  crossProjectSecretSharingService
}: TProjectFolderGrantServiceFactoryDep) => {
  const createGrant = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    sourceProjectId,
    environment,
    secretPath,
    targetProjectId
  }: TCreateProjectFolderGrantDTO) => {
    if (!(await crossProjectSecretSharingService.isCrossProjectEnabled(actorOrgId, orgDAL))) {
      throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
    }

    const canonicalSecretPath = normalizeSecretPath(secretPath);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      subject(ProjectPermissionSub.ProjectFolderGrant, { environment, secretPath: canonicalSecretPath })
    );

    const folder = await folderDAL.findBySecretPath(sourceProjectId, environment, canonicalSecretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder not found at path '${canonicalSecretPath}' in environment '${environment}'`
      });
    }

    const targetProject = await projectDAL.findById(targetProjectId);
    if (!targetProject || targetProject.orgId !== actorOrgId) {
      throw new NotFoundError({ message: "Target project not found in this organization" });
    }

    if (sourceProjectId === targetProjectId) {
      throw new BadRequestError({ message: "Source and target project cannot be the same" });
    }

    const existing = await projectFolderGrantDAL.findOne({
      sourceProjectId,
      sourceFolderId: folder.id,
      targetProjectId
    });
    if (existing) {
      throw new BadRequestError({ message: "A grant already exists for this folder and target project" });
    }

    const grant = await projectFolderGrantDAL.create({ sourceProjectId, sourceFolderId: folder.id, targetProjectId });
    // Invalidate the target project's secret cache so cross-project references resolve immediately
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(targetProjectId);
    return grant;
  };

  const deleteGrant = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    grantId,
    sourceProjectId
  }: TDeleteProjectFolderGrantDTO) => {
    if (!(await crossProjectSecretSharingService.isCrossProjectEnabled(actorOrgId, orgDAL))) {
      throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
    }

    const grant = await projectFolderGrantDAL.findById(grantId);
    if (!grant || grant.sourceProjectId !== sourceProjectId) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const [folderInfo] = await folderDAL.findSecretPathByFolderIds(sourceProjectId, [grant.sourceFolderId]);
    if (!folderInfo) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectFolderGrantActions.RevokeGrant,
      subject(ProjectPermissionSub.ProjectFolderGrant, {
        environment: folderInfo.environmentSlug,
        secretPath: folderInfo.path
      })
    );

    const deleted = await projectFolderGrantDAL.deleteById(grantId);
    // Invalidate the target project's secret cache so revoked references stop resolving immediately
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(grant.targetProjectId);
    return { ...deleted, environment: folderInfo.environmentSlug, secretPath: folderInfo.path };
  };

  const listGrantsByProject = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    sourceProjectId
  }: TListProjectFolderGrantsDTO) => {
    if (!(await crossProjectSecretSharingService.isCrossProjectEnabled(actorOrgId, orgDAL))) {
      return [];
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectFolderGrantActions.ReadGrant,
      ProjectPermissionSub.ProjectFolderGrant
    );

    const grants = await projectFolderGrantDAL.listBySourceProject(sourceProjectId);

    const folderIds = grants.map((g) => g.sourceFolderId);
    const folderPaths =
      folderIds.length > 0 ? await folderDAL.findSecretPathByFolderIds(sourceProjectId, folderIds) : [];

    return grants.map((g, i) => ({
      ...g,
      secretPath: folderPaths[i]?.path ?? "/"
    }));
  };

  const listGrantsForTargetProject = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    targetProjectId
  }: TListProjectFolderGrantsForTargetDTO) => {
    if (!(await crossProjectSecretSharingService.isCrossProjectEnabled(actorOrgId, orgDAL))) {
      return [];
    }

    await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: targetProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const grants = await projectFolderGrantDAL.listByTargetProject(targetProjectId);

    const grantsBySourceProject = new Map<string, typeof grants>();
    for (const g of grants) {
      const list = grantsBySourceProject.get(g.sourceProjectId) ?? [];
      list.push(g);
      grantsBySourceProject.set(g.sourceProjectId, list);
    }

    const pathsByGrantId = new Map<string, string>();
    await Promise.all(
      Array.from(grantsBySourceProject.entries()).map(async ([srcProjectId, projectGrants]) => {
        const folderIds = projectGrants.map((g) => g.sourceFolderId);
        const folderPaths = await folderDAL.findSecretPathByFolderIds(srcProjectId, folderIds);
        projectGrants.forEach((g, i) => {
          pathsByGrantId.set(g.id, folderPaths[i]?.path ?? "/");
        });
      })
    );

    return grants.map((g) => ({
      ...g,
      secretPath: pathsByGrantId.get(g.id) ?? "/"
    }));
  };

  const getGrantUsage = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    grantId,
    sourceProjectId
  }: TGetGrantUsageDTO) => {
    const grant = await projectFolderGrantDAL.findById(grantId);
    if (!grant || grant.sourceProjectId !== sourceProjectId) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectFolderGrantActions.ReadGrant,
      ProjectPermissionSub.ProjectFolderGrant
    );

    const [folderInfo] = await folderDAL.findSecretPathByFolderIds(sourceProjectId, [grant.sourceFolderId]);
    if (!folderInfo) {
      return { importCount: 0, referenceCount: 0 };
    }

    const sourceProject = await projectDAL.findById(sourceProjectId);
    if (!sourceProject) {
      return { importCount: 0, referenceCount: 0 };
    }

    return projectFolderGrantDAL.countUsageByGrant({
      targetProjectId: grant.targetProjectId,
      sourceEnvId: folderInfo.envId,
      sourcePath: folderInfo.path,
      sourceProjectSlug: sourceProject.slug,
      sourceEnvSlug: folderInfo.environmentSlug
    });
  };

  return { createGrant, deleteGrant, listGrantsByProject, listGrantsForTargetProject, getGrantUsage };
};
