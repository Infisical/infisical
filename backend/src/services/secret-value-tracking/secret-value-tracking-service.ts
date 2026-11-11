import { ProjectType } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TActorInput } from "@app/lib/types";
import { JobState } from "@app/queue/queue-service";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretValueTrackingQueueFactory } from "./secret-value-tracking-queue";

type TProjectActorDTO = { projectId: string } & TActorInput;

type TSecretValueTrackingServiceFactoryDep = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById">;
  secretValueTrackingQueue: TSecretValueTrackingQueueFactory;
};

export const secretValueTrackingServiceFactory = ({
  organizationsDomain,
  secretsDomain,
  orgDAL,
  projectDAL,
  secretValueTrackingQueue
}: TSecretValueTrackingServiceFactoryDep) => {
  const enableForOrg = async ({ actor }: TActorInput) => {
    const orgId = actor.org.id;
    const permission = await organizationsDomain.getOrgPermission({ actor });
    // Whoever may search every secret value may also turn the index on: the backfill unlocks exactly
    // the searches this permission already allows, and nothing else.
    permission.assert({
      action: OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
      subject: OrgPermissionSubjects.SecretsManagementInsights
    });

    permission.assert({ action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings });

    const org = await orgDAL.findById(orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    if (org.orgWideSecretValueTrackingEnabled) {
      throw new BadRequestError({ message: "Secret value search is already enabled for this organization" });
    }

    const projects = await projectDAL.find({ orgId, type: ProjectType.SecretManager });

    // A run that is already moving is refused by the queue: one job id per scope, and BullMQ will not
    // add a second job under an id it already holds.
    await secretValueTrackingQueue.startBackfill({ scope: "org", orgId });

    return { projectsTotal: projects.length };
  };

  const getOrgStatus = async ({ actor }: TActorInput) => {
    const orgId = actor.org.id;
    const permission = await organizationsDomain.getOrgPermission({ actor });
    permission.assert({
      action: OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
      subject: OrgPermissionSubjects.SecretsManagementInsights
    });

    const org = await orgDAL.findById(orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    // The flag is the durable answer. The queue only says whether a run is in flight, or why the
    // last one stopped, and it drops a finished job within the minute.
    const progress = await secretValueTrackingQueue.getBackfillState({ scope: "org", orgId });
    return org.orgWideSecretValueTrackingEnabled ? { ...progress, status: JobState.Completed } : progress;
  };

  const $assertProjectSettingsEdit = async ({ actor, projectId }: TProjectActorDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: project.id });
    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Settings });

    return project;
  };

  const enableForProject = async (dto: TProjectActorDTO) => {
    const project = await $assertProjectSettingsEdit(dto);
    if (project.secretBlindIndexEnabled) {
      throw new BadRequestError({ message: "Secret blind indexing is already enabled for this project" });
    }

    await secretValueTrackingQueue.startBackfill({ scope: "project", projectId: project.id });
  };

  const getProjectStatus = async (dto: TProjectActorDTO) => {
    const project = await $assertProjectSettingsEdit(dto);

    const progress = await secretValueTrackingQueue.getBackfillState({ scope: "project", projectId: project.id });
    return project.secretBlindIndexEnabled ? { ...progress, status: JobState.Completed } : progress;
  };

  return { enableForOrg, getOrgStatus, enableForProject, getProjectStatus };
};

export type TSecretValueTrackingServiceFactory = ReturnType<typeof secretValueTrackingServiceFactory>;
