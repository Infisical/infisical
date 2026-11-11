import { packRules } from "@casl/ability/extra";

import {
  ProjectMembershipRole,
  ProjectType,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType
} from "@app/db/schemas";
import {
  ApplicationPermissionActions,
  ApplicationPermissionSub,
  TCertManagerDomain
} from "@app/domains/certificates/cert-manager/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ProjectPermissionApplicationActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { TAlertServiceFactory } from "../alert/alert-service";
import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalPolicyScope } from "../approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "../approval-policy/approval-request-dal";
import { CERT_MANAGER_APPLICATION_RESOURCE_TYPE } from "../certificate/certificate-alert-events";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncFilters } from "../pki-sync/pki-sync-types";
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
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  certManagerDomain: Pick<TCertManagerDomain, "getApplicationPermission">;
  alertService: Pick<TAlertServiceFactory, "deleteAlertsForDeletedResource">;
};

export type TPkiApplicationServiceFactory = ReturnType<typeof pkiApplicationServiceFactory>;

export const pkiApplicationServiceFactory = ({
  pkiApplicationDAL,
  pkiApplicationProfileDAL,
  membershipDAL,
  membershipRoleDAL,
  approvalPolicyDAL,
  approvalRequestDAL,
  pkiSyncDAL,
  projectsDomain,
  certManagerDomain,
  alertService
}: TPkiApplicationServiceFactoryDep) => {
  const $loadProjectPermission = (projectId: string, actor: TActorContext) =>
    projectsDomain.getProjectPermission({ actor, projectId, type: ProjectType.CertificateManager });

  const $loadResourcePermission = (applicationId: string, projectId: string, actor: TActorContext) =>
    certManagerDomain.getApplicationPermission({ actor, projectId, applicationId });

  const createApplication = async ({ name, description, profileIds, projectId, actor }: TCreatePkiApplicationDTO) => {
    const permission = await $loadProjectPermission(projectId, actor);

    permission.assert({
      action: ProjectPermissionApplicationActions.Create,
      subject: ProjectPermissionSub.Application
    });

    const existing = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
    if (existing) {
      throw new BadRequestError({ message: `An application with name '${name}' already exists in this organization.` });
    }

    if (profileIds && profileIds.length > 0) {
      const profilesInProject = await pkiApplicationProfileDAL.findProfilesInProject(profileIds, projectId);
      if (profilesInProject.length !== profileIds.length) {
        throw new BadRequestError({
          message: "One or more profileIds do not belong to this organization."
        });
      }

      for (const profile of profilesInProject) {
        permission.assert({
          action: ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
          subject: ProjectPermissionSub.CertificateProfiles,
          fields: { slug: profile.slug }
        });
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

        if (actor.org.id && (actor.principal.type === ActorType.USER || actor.principal.type === ActorType.IDENTITY)) {
          const newMembership = await membershipDAL.create(
            {
              scope: RESOURCE_SCOPE,
              scopeOrgId: actor.org.id,
              scopeProjectId: projectId,
              scopeResourceType: ResourceType.CertificateApplication,
              scopeResourceId: application.id,
              actorUserId: actor.principal.type === ActorType.USER ? actor.principal.id : null,
              actorIdentityId: actor.principal.type === ActorType.IDENTITY ? actor.principal.id : null,
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
        throw new BadRequestError({
          message: `An application with name '${name}' already exists in this organization.`
        });
      }
      throw err;
    }
  };

  const getApplicationById = async ({ applicationId, projectId, actor }: TGetPkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Read,
      subject: ApplicationPermissionSub.Application
    });

    return application;
  };

  const getApplicationByName = async ({ name, projectId, actor }: TGetPkiApplicationByNameDTO) => {
    const application = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
    if (!application) {
      throw new NotFoundError({ message: `Application with name '${name}' not found in this organization.` });
    }

    const permission = await $loadResourcePermission(application.id, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Read,
      subject: ApplicationPermissionSub.Application
    });

    return application;
  };

  const listApplications = async ({
    search,
    limit,
    offset,
    applicationIds,
    projectId,
    actor
  }: TListPkiApplicationsDTO) => {
    const permission = await $loadProjectPermission(projectId, actor);

    permission.assert({ action: ProjectPermissionApplicationActions.List, subject: ProjectPermissionSub.Application });

    if (permission.hasRole({ slug: ProjectMembershipRole.Admin })) {
      const [applications, total] = await Promise.all([
        pkiApplicationDAL.findByProjectId(projectId, { search, limit, offset, applicationIds }),
        pkiApplicationDAL.countByProjectId(projectId, search, undefined, applicationIds)
      ]);
      return { applications, total };
    }

    const memberships = await membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.CertificateApplication,
      actorType: actor.principal.type,
      actorId: actor.principal.id
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
    actor
  }: TUpdatePkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Edit,
      subject: ApplicationPermissionSub.Application
    });

    if (name && name !== application.name) {
      const collision = await pkiApplicationDAL.findByNameAndProjectId(name, projectId);
      if (collision) {
        throw new BadRequestError({
          message: `An application with name '${name}' already exists in this organization.`
        });
      }
    }

    try {
      return await pkiApplicationDAL.updateById(applicationId, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description })
      });
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({
          message: `An application with name '${name}' already exists in this organization.`
        });
      }
      throw err;
    }
  };

  const deleteApplication = async ({ applicationId, projectId, actor }: TDeletePkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Delete,
      subject: ApplicationPermissionSub.Application
    });

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
      await alertService.deleteAlertsForDeletedResource(
        { resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE, resourceId: applicationId },
        tx
      );
      await pkiApplicationDAL.deleteById(applicationId, tx);
    });

    return application;
  };

  const listApplicationProfiles = async ({ applicationId, projectId, actor }: TListApplicationProfilesDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Read,
      subject: ApplicationPermissionSub.Application
    });

    const profiles = await pkiApplicationProfileDAL.findByApplicationId(applicationId);
    return profiles;
  };

  const attachProfiles = async ({ applicationId, profileIds, projectId, actor }: TAttachProfilesDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.ManageProfiles,
      subject: ApplicationPermissionSub.Application
    });

    const profilesInProject = await pkiApplicationProfileDAL.findProfilesInProject(profileIds, projectId);
    if (profilesInProject.length !== profileIds.length) {
      throw new BadRequestError({ message: "One or more profileIds do not belong to this organization." });
    }

    const projectPermission = await $loadProjectPermission(projectId, actor);
    for (const profile of profilesInProject) {
      projectPermission.assert({
        action: ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
        subject: ProjectPermissionSub.CertificateProfiles,
        fields: { slug: profile.slug }
      });
    }

    const profiles = await pkiApplicationDAL.transaction(async (tx) => {
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

    return { profiles, applicationName: application.name };
  };

  const detachProfile = async ({ applicationId, profileId, projectId, actor }: TDetachProfileDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.ManageProfiles,
      subject: ApplicationPermissionSub.Application
    });

    const link = await pkiApplicationProfileDAL.findOneByApplicationAndProfile(applicationId, profileId);
    if (!link) {
      throw new NotFoundError({
        message: `Profile '${profileId}' is not attached to application '${applicationId}'.`
      });
    }

    const [profile] = await pkiApplicationProfileDAL.findProfilesInProject([profileId], projectId);
    if (!profile) {
      throw new NotFoundError({ message: `Profile '${profileId}' not found in this organization.` });
    }

    const projectPermission = await $loadProjectPermission(projectId, actor);
    projectPermission.assert({
      action: ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
      subject: ProjectPermissionSub.CertificateProfiles,
      fields: { slug: profile.slug }
    });

    const pkiSyncs = await pkiSyncDAL.find({ applicationId });
    const syncsFilteringOnProfile = pkiSyncs.filter((pkiSync) =>
      ((pkiSync.filters as TPkiSyncFilters | null)?.profileIds ?? []).includes(profileId)
    );

    if (syncsFilteringOnProfile.length > 0) {
      const names = syncsFilteringOnProfile.map(({ name }) => name).sort();
      const preview = names.slice(0, 5).join(", ");
      const remaining = names.length - 5;
      const isSingular = names.length === 1;
      throw new BadRequestError({
        message: `Cannot detach this certificate profile while ${names.length} certificate sync${
          isSingular ? " selects" : "s select"
        } certificates by it (${
          remaining > 0 ? `${preview}, and ${remaining} more` : preview
        }). Remove the certificate profile filter from ${isSingular ? "that sync" : "those syncs"} first.`
      });
    }

    await pkiApplicationProfileDAL.delete({ applicationId, profileId });
    return { applicationId, applicationName: application.name, profileId };
  };

  const getApplicationPermissions = async ({ applicationId, projectId, actor }: TGetPkiApplicationDTO) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const permission = await $loadResourcePermission(applicationId, projectId, actor);

    permission.assert({
      action: ApplicationPermissionActions.Read,
      subject: ApplicationPermissionSub.Application
    });

    return {
      permissions: packRules(permission.rules),
      memberships: permission.memberships.map((membership) => membership.toJSON())
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
