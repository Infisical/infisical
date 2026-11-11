import { ProjectPermissionActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

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
  secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId">;
};

export type TSecretTagServiceFactory = ReturnType<typeof secretTagServiceFactory>;

export const secretTagServiceFactory = ({
  secretTagDAL,
  secretsDomain,
  secretV2BridgeDAL
}: TSecretTagServiceFactoryDep) => {
  const createTag = async ({ slug, actor, color, projectId }: TCreateTagDTO) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.Tags });

    const existingTag = await secretTagDAL.findOne({ slug, projectId });
    if (existingTag) throw new BadRequestError({ message: "Tag already exists" });

    const newTag = await secretTagDAL.create({
      projectId,
      slug,
      color,
      createdBy: actor.principal.id,
      createdByActorType: actor.principal.type
    });
    return newTag;
  };

  const updateTag = async ({ actor, id, color, slug }: TUpdateTagDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    if (slug) {
      const existingTag = await secretTagDAL.findOne({ slug, projectId: tag.projectId });
      if (existingTag && existingTag.id !== tag.id) throw new BadRequestError({ message: "Tag already exists" });
    }

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: tag.projectId });
    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags });

    const updatedTag = await secretTagDAL.updateById(tag.id, { color, slug });
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(tag.projectId);
    return updatedTag;
  };

  const deleteTag = async ({ actor, id }: TDeleteTagDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: tag.projectId });
    permission.assert({ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Tags });

    const deletedTag = await secretTagDAL.deleteById(tag.id);
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(tag.projectId);
    return deletedTag;
  };

  const getTagById = async ({ actor, id }: TGetTagByIdDTO) => {
    const tag = await secretTagDAL.findById(id);
    if (!tag) throw new NotFoundError({ message: `Tag with ID '${id}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: tag.projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Tags });

    return { ...tag, name: tag.slug };
  };

  const getTagBySlug = async ({ actor, slug, projectId }: TGetTagBySlugDTO) => {
    const tag = await secretTagDAL.findOne({ projectId, slug });
    if (!tag) throw new NotFoundError({ message: `Tag with slug '${slug}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: tag.projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Tags });

    return { ...tag, name: tag.slug };
  };

  const getProjectTags = async ({ actor, projectId }: TListProjectTagsDTO) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Tags });

    const tags = await secretTagDAL.find({ projectId }, { sort: [["createdAt", "asc"]] });
    return tags;
  };

  return { createTag, deleteTag, getProjectTags, getTagById, getTagBySlug, updateTag };
};
