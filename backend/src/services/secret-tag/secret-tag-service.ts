import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { countOnPrimary, getResourceLimits, ResourceLimit } from "@app/lib/resource-limits";

import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretTagDALFactory } from "./secret-tag-dal";
import {
  TCreateTagDTO,
  TDeleteTagDTO,
  TGetTagByIdDTO,
  TGetTagBySlugDTO,
  TListProjectTagsDTO,
  TUpdateTagDTO
} from "./secret-tag-types";

type TSecretTagServiceFactoryDep = {
  secretTagDAL: TSecretTagDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId">;
  licenseService: Pick<TLicenseService, "getPlan" | "getLastKnownPlan">;
};

export type TSecretTagServiceFactory = ReturnType<typeof secretTagServiceFactory>;

export const secretTagServiceFactory = ({
  secretTagDAL,
  permissionService,
  secretV2BridgeDAL,
  licenseService
}: TSecretTagServiceFactoryDep) => {
  const createTag = async ({ slug, actor, color, actorId, actorOrgId, actorAuthMethod, projectId }: TCreateTagDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);

    const existingTag = await secretTagDAL.findOne({ slug, projectId });
    if (existingTag) throw new BadRequestError({ message: "Tag already exists" });

    const resourceLimits = await getResourceLimits(licenseService, actorOrgId);
    if (resourceLimits.max(ResourceLimit.TagsPerProject) !== null) {
      const tagCount = await countOnPrimary(secretTagDAL, async (tx) => {
        const [{ count }] = await secretTagDAL.find({ projectId }, { countDistinct: "id", tx });
        return Number(count);
      });
      resourceLimits.assertWithin({
        limit: ResourceLimit.TagsPerProject,
        used: tagCount,
        describe: (max) =>
          `Project already has the maximum of ${max} tags. Delete tags you no longer use before creating another.`
      });
    }

    const newTag = await secretTagDAL.create({
      projectId,
      slug,
      color,
      createdBy: actorId,
      createdByActorType: actor
    });
    return newTag;
  };

  const updateTag = async ({ actorId, actor, actorOrgId, actorAuthMethod, id, color, slug }: TUpdateTagDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    if (slug) {
      const existingTag = await secretTagDAL.findOne({ slug, projectId: tag.projectId });
      if (existingTag && existingTag.id !== tag.id) throw new BadRequestError({ message: "Tag already exists" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: tag.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags);

    const updatedTag = await secretTagDAL.updateById(tag.id, { color, slug });
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(tag.projectId);
    return updatedTag;
  };

  const deleteTag = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TDeleteTagDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: tag.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

    const deletedTag = await secretTagDAL.deleteById(tag.id);
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(tag.projectId);
    return deletedTag;
  };

  const getTagById = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TGetTagByIdDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: tag.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);

    return { ...tag, name: tag.slug };
  };

  const getTagBySlug = async ({ actorId, actor, actorOrgId, actorAuthMethod, slug, projectId }: TGetTagBySlugDTO) => {
    const tag = await secretTagDAL.findOne({ projectId, slug });
    if (!tag) throw new NotFoundError({ message: `Tag with slug '${slug}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: tag.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);

    return { ...tag, name: tag.slug };
  };

  const getProjectTags = async ({ actor, actorId, actorOrgId, actorAuthMethod, projectId }: TListProjectTagsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);

    const tags = await secretTagDAL.find({ projectId }, { sort: [["createdAt", "asc"]] });
    return tags;
  };

  return { createTag, deleteTag, getProjectTags, getTagById, getTagBySlug, updateTag };
};
