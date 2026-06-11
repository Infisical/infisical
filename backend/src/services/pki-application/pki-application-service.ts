import { ForbiddenError, subject } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import {
  ActionProjectType,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionApplicationActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionApplicationActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "../approval-policy/approval-request-dal";
import { ActorType } from "../auth/auth-type";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TPkiApplicationDALFactory } from "./pki-application-dal";
import { TPkiApplicationProfileDALFactory } from "./pki-application-profile-dal";
import {
  TAttachProfilesDTO,
  TCreatePkiApplicationDTO,
  TDeletePkiApplicationDTO,
  TDetachProfileDTO,
  TGetPkiApplicationByNameDTO,
  TGetPkiApplicationDTO,
  TListApplicationProfilesDTO,
  TListPkiApplicationsDTO,
  TUpdatePkiApplicationDTO
} from "./pki-application-types";

type TPkiApplicationServiceFactoryDep = {
  pkiApplicationDAL: Pick<
    TPkiApplicationDALFactory,
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "transaction"
    | "findByNameAndProjectId"
    | "findByProjectId"
    | "countByProjectId"
  >;
  pkiApplicationProfileDAL: Pick<
    TPkiApplicationProfileDALFactory,
    "insertMany" | "delete" | "findByApplicationId" | "findOneByApplicationAndProfile" | "findProfilesInProject"
  >;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "create" | "delete" | "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "delete">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
};

export type TPkiApplicationServiceFactory = ReturnType<typeof pkiApplicationServiceFactory>;

export const pkiApplicationServiceFactory = ({
  pkiApplicationDAL,
  pkiApplicationProfileDAL,
  membershipDAL,
  membershipRoleDAL,
  approvalPolicyDAL,
  approvalRequestDAL,
  permissionService
}: TPkiApplicationServiceFactoryDep) => {
  const $loadProjectPermission = (
    projectId: string,
    ctx: {
      actor: TCreatePkiApplicationDTO["actor"];
      actorId: string;
      actorAuthMethod: TCreatePkiApplicationDTO["actorAuthMethod"];
      actorOrgId?: string;
    }
  ) =>
    permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

  const $loadResourcePermission = (
    applicationId: string,
    projectId: string,
    ctx: {
      actor: TCreatePkiApplicationDTO["actor"];
      actorId: string;
      actorAuthMethod: TCreatePkiApplicationDTO["actorAuthMethod"];
      actorOrgId?: string;
    }
  ) =>
    permissionService.getResourcePermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });

  const createApplication = async ({
    name,
    description,
    profileIds,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreatePkiApplicationDTO) => {
    const { permission } = await $loadProjectPermission(projectId, { actor, actorId, actorAuthMethod, actorOrgId });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApplicationActions.Create,
      ProjectPermissionSub.Application
    );

    const existing = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
    if (existing) {
      throw new BadRequestError({ message: `An application with name '${name}' already exists in this project.` });
    }

    if (profileIds && profileIds.length > 0) {
      const profilesInProject = await pkiApplicationProfileDAL.findProfilesInProject(profileIds, projectId);
      if (profilesInProject.length !== profileIds.length) {
        throw new BadRequestError({
          message: "One or more profileIds do not belong to this project."
        });
      }

      for (const profile of profilesInProject) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
          subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
        );
      }
    }

    try {
      return await pkiApplicationDAL.transaction(async (tx) => {
        const application = await pkiApplicationDAL.create({ projectId, name, description: description ?? null }, tx);

        if (profileIds && profileIds.length > 0) {
          await pkiApplicationProfileDAL.insertMany(
            profileIds.map((profileId) => ({ applicationId: application.id, profileId })),
            tx
          );
        }

        if (actorOrgId && (actor === ActorType.USER || actor === ActorType.IDENTITY)) {
          const newMembership = await membershipDAL.create(
            {
              scope: RESOURCE_SCOPE,
              scopeOrgId: actorOrgId,
              scopeProjectId: projectId,
              scopeResourceType: ResourceType.CertificateApplication,
              scopeResourceId: application.id,
              actorUserId: actor === ActorType.USER ? actorId : null,
              actorIdentityId: actor === ActorType.IDENTITY ? actorId : null,
              actorGroupId: null,
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create({ membershipId: newMembership.id, role: ResourceMembershipRole.Admin }, tx);
        }

        return application;
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({ message: `An application with name '${name}' already exists in this project.` });
      }
      throw err;
    }
  };

  const getApplicationById = async ({
    applicationId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );

    return application;
  };

  const getApplicationByName = async ({
    name,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiApplicationByNameDTO) => {
    const application = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
    if (!application) {
      throw new NotFoundError({ message: `Application with name '${name}' not found in this project.` });
    }

    const { permission } = await $loadResourcePermission(application.id, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );

    return application;
  };

  const listApplications = async ({
    search,
    limit,
    offset,
    applicationIds,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListPkiApplicationsDTO) => {
    const { permission, hasRole } = await $loadProjectPermission(projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApplicationActions.List,
      ProjectPermissionSub.Application
    );

    if (hasRole(ProjectMembershipRole.Admin)) {
      const [applications, total] = await Promise.all([
        pkiApplicationDAL.findByProjectId(projectId, { search, limit, offset, applicationIds }),
        pkiApplicationDAL.countByProjectId(projectId, search, undefined, applicationIds)
      ]);
      return { applications, total };
    }

    const memberships = await membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.CertificateApplication,
      actorType: actor,
      actorId
    });

    const allowedIds = Array.from(
      new Set(memberships.map((m) => m.scopeResourceId).filter((id): id is string => Boolean(id)))
    );

    const scopedIds = applicationIds ? allowedIds.filter((id) => applicationIds.includes(id)) : allowedIds;

    if (scopedIds.length === 0) {
      return { applications: [], total: 0 };
    }

    const [applications, total] = await Promise.all([
      pkiApplicationDAL.findByProjectId(projectId, {
        search,
        limit,
        offset,
        applicationIds: scopedIds
      }),
      pkiApplicationDAL.countByProjectId(projectId, search, undefined, scopedIds)
    ]);
    return { applications, total };
  };

  const updateApplication = async ({
    applicationId,
    name,
    description,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdatePkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );

    if (name && name !== application.name) {
      const collision = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
      if (collision) {
        throw new BadRequestError({ message: `An application with name '${name}' already exists in this project.` });
      }
    }

    try {
      return await pkiApplicationDAL.updateById(applicationId, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description })
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({ message: `An application with name '${name}' already exists in this project.` });
      }
      throw err;
    }
  };

  const deleteApplication = async ({
    applicationId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeletePkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Delete,
      ResourcePermissionSub.Application
    );

    await pkiApplicationDAL.transaction(async (tx) => {
      const orphans = await membershipDAL.find(
        {
          scope: RESOURCE_SCOPE,
          scopeResourceType: ResourceType.CertificateApplication,
          scopeResourceId: applicationId
        },
        { tx }
      );
      if (orphans.length > 0) {
        const ids = orphans.map((m) => m.id);
        await membershipRoleDAL.delete({ $in: { membershipId: ids } }, tx);
        await membershipDAL.delete({ $in: { id: ids } }, tx);
      }
      await approvalRequestDAL.delete({ scopeType: ApprovalPolicyScope.PkiApplication, scopeId: applicationId }, tx);
      await approvalPolicyDAL.delete({ scopeType: ApprovalPolicyScope.PkiApplication, scopeId: applicationId }, tx);
      await pkiApplicationDAL.deleteById(applicationId, tx);
    });

    return application;
  };

  const listApplicationProfiles = async ({
    applicationId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListApplicationProfilesDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );

    const profiles = await pkiApplicationProfileDAL.findByApplicationId(applicationId);
    return profiles;
  };

  const attachProfiles = async ({
    applicationId,
    profileIds,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAttachProfilesDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.ManageProfiles,
      ResourcePermissionSub.Application
    );

    const profilesInProject = await pkiApplicationProfileDAL.findProfilesInProject(profileIds, projectId);
    if (profilesInProject.length !== profileIds.length) {
      throw new BadRequestError({ message: "One or more profileIds do not belong to this project." });
    }

    const { permission: projectPermission } = await $loadProjectPermission(projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });
    for (const profile of profilesInProject) {
      ForbiddenError.from(projectPermission).throwUnlessCan(
        ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
        subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
      );
    }

    return pkiApplicationDAL.transaction(async (tx) => {
      const existing = await pkiApplicationProfileDAL.findByApplicationId(applicationId, tx);
      const existingProfileIds = new Set(existing.map((row) => row.profileId));
      const toAttach = profileIds.filter((id) => !existingProfileIds.has(id));

      if (toAttach.length > 0) {
        await pkiApplicationProfileDAL.insertMany(
          toAttach.map((profileId) => ({ applicationId, profileId })),
          tx
        );
      }

      return pkiApplicationProfileDAL.findByApplicationId(applicationId, tx);
    });
  };

  const detachProfile = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDetachProfileDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.ManageProfiles,
      ResourcePermissionSub.Application
    );

    const link = await pkiApplicationProfileDAL.findOneByApplicationAndProfile(applicationId, profileId);
    if (!link) {
      throw new NotFoundError({
        message: `Profile '${profileId}' is not attached to application '${applicationId}'.`
      });
    }

    const [profile] = await pkiApplicationProfileDAL.findProfilesInProject([profileId], projectId);
    if (!profile) {
      throw new NotFoundError({ message: `Profile '${profileId}' not found in project.` });
    }

    const { permission: projectPermission } = await $loadProjectPermission(projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    );

    await pkiApplicationProfileDAL.delete({ applicationId, profileId });
    return { applicationId, profileId };
  };

  const getApplicationPermissions = async ({
    applicationId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const { permission, memberships } = await $loadResourcePermission(applicationId, projectId, {
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );

    return {
      permissions: packRules(permission.rules),
      memberships
    };
  };

  return {
    createApplication,
    getApplicationById,
    getApplicationByName,
    listApplications,
    updateApplication,
    deleteApplication,
    listApplicationProfiles,
    attachProfiles,
    detachProfile,
    getApplicationPermissions
  };
};
