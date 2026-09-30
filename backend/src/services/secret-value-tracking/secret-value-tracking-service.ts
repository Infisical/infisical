import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor, TProjectPermission } from "@app/lib/types";
import { JobState } from "@app/queue/queue-service";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretValueTrackingQueueFactory } from "./secret-value-tracking-queue";

type TSecretValueTrackingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById">;
  secretValueTrackingQueue: TSecretValueTrackingQueueFactory;
};

export const secretValueTrackingServiceFactory = ({
  permissionService,
  orgDAL,
  projectDAL,
  secretValueTrackingQueue
}: TSecretValueTrackingServiceFactoryDep) => {
  const enableForOrg = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    // Whoever may search every secret value may also turn the index on: the backfill unlocks exactly
    // the searches this permission already allows, and nothing else.
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
      OrgPermissionSubjects.SecretsManagementInsights
    );

    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    if (org.orgWideSecretValueTrackingEnabled) {
      throw new BadRequestError({ message: "Secret value search is already enabled for this organization" });
    }

    const projects = await projectDAL.find({ orgId: actor.orgId, type: ProjectType.SecretManager });

    // A run that is already moving is refused by the queue: one job id per scope, and BullMQ will not
    // add a second job under an id it already holds.
    await secretValueTrackingQueue.startBackfill({ scope: "org", orgId: actor.orgId });

    return { projectsTotal: projects.length };
  };

  const getOrgStatus = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
      OrgPermissionSubjects.SecretsManagementInsights
    );

    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    // The flag is the durable answer. The queue only says whether a run is in flight, or why the
    // last one stopped, and it drops a finished job within the minute.
    const progress = await secretValueTrackingQueue.getBackfillState({ scope: "org", orgId: actor.orgId });
    return org.orgWideSecretValueTrackingEnabled ? { ...progress, status: JobState.Completed } : progress;
  };

  const $assertProjectSettingsEdit = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectPermission) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    return project;
  };

  const enableForProject = async (dto: TProjectPermission) => {
    const project = await $assertProjectSettingsEdit(dto);
    if (project.secretBlindIndexEnabled) {
      throw new BadRequestError({ message: "Secret blind indexing is already enabled for this project" });
    }

    await secretValueTrackingQueue.startBackfill({ scope: "project", projectId: project.id });
  };

  const getProjectStatus = async (dto: TProjectPermission) => {
    const project = await $assertProjectSettingsEdit(dto);

    const progress = await secretValueTrackingQueue.getBackfillState({ scope: "project", projectId: project.id });
    return project.secretBlindIndexEnabled ? { ...progress, status: JobState.Completed } : progress;
  };

  return { enableForOrg, getOrgStatus, enableForProject, getProjectStatus };
};

export type TSecretValueTrackingServiceFactory = ReturnType<typeof secretValueTrackingServiceFactory>;
