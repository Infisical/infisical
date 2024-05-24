import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TSecretTagDALFactory } from "./secret-tag-dal";
import { TCreateTagDTO, TDeleteTagDTO, TListProjectTagsDTO } from "./secret-tag-types";

type TSecretTagServiceFactoryDep = {
  secretTagDAL: TSecretTagDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSecretTagServiceFactory = ReturnType<typeof secretTagServiceFactory>;

export const secretTagServiceFactory = ({ secretTagDAL, permissionService }: TSecretTagServiceFactoryDep) => {
  const createTag = async ({
    name,
    slug,
    actor,
    color,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TCreateTagDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);

    const existingTag = await secretTagDAL.findOne({ slug, projectId });
    if (existingTag) throw new BadRequestError({ message: "Tag already exist" });

    const newTag = await secretTagDAL.create({
      projectId,
      name,
      slug,
      color,
      createdBy: actorId
    });
    return newTag;
  };

  const deleteTag = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TDeleteTagDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new BadRequestError({ message: "Tag doesn't exist" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      tag.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags);

    const deletedTag = await secretTagDAL.deleteById(tag.id);
    return deletedTag;
  };

  const getProjectTags = async ({ actor, actorId, actorOrgId, actorAuthMethod, projectId }: TListProjectTagsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);

    const tags = await secretTagDAL.find({ projectId }, { sort: [["createdAt", "asc"]] });
    return tags;
  };

  return { createTag, deleteTag, getProjectTags };
};
