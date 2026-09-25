import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, ProjectType } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor, TProjectPermission } from "@app/lib/types";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { resolveRunStatus } from "./secret-value-tracking-fns";
import { TSecretValueTrackingQueueFactory } from "./secret-value-tracking-queue";
import { secretValueTrackingStateFactory } from "./secret-value-tracking-state";

type TSecretValueTrackingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById">;
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem">;
  secretValueTrackingQueue: TSecretValueTrackingQueueFactory;
};

export const secretValueTrackingServiceFactory = ({
  permissionService,
  orgDAL,
  projectDAL,
  keyStore,
  secretValueTrackingQueue
}: TSecretValueTrackingServiceFactoryDep) => {
  const state = secretValueTrackingStateFactory({ keyStore });

  const $progressOf = (runState: Awaited<ReturnType<typeof state.read>>) => ({
    projectsTotal: runState?.projectsTotal ?? 0,
    projectsDone: runState?.projectsDone ?? 0,
    secretsProcessed: runState?.secretsProcessed ?? 0
  });

  const enableForOrg = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    // Deliberately not refused when the flag is already set. Several ordinary operations can put an
    // unindexed row back into a completed org (a rollback to a version predating the digest, an
    // environment restored after the walk passed it), and without a re-run the only repair is SQL.
    // The walk skips rows that already carry both digests, so a redundant run costs a read pass.

    // Projects are counted so progress can be reported as "project M of N". Secrets deliberately are
    // not: counting them is expensive on exactly the organizations where progress matters, and the
    // number is stale the moment it is taken.
    const projects = await projectDAL.find({ orgId: actor.orgId, type: ProjectType.SecretManager });
    const projectsTotal = projects.length;

    const claimed = await state.claim(actor.orgId, projectsTotal);
    if (!claimed) {
      throw new BadRequestError({
        message: "A secret value tracking backfill is already running for this organization"
      });
    }

    // Releasing the claim matters: without it a failed enqueue leaves the organization holding a
    // claim it is not using, and the guard refuses every retry until the staleness window passes.
    try {
      await secretValueTrackingQueue.startBackfill({ scope: "org", orgId: actor.orgId });
    } catch (error) {
      await state.clear(actor.orgId);
      throw error;
    }

    return { projectsTotal };
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    const runState = await state.read(actor.orgId);
    return {
      ...resolveRunStatus(runState, Boolean(org.orgWideSecretValueTrackingEnabled), new Date()),
      ...$progressOf(runState)
    };
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

    const claimed = await state.claim(project.id, 1);
    if (!claimed) {
      throw new BadRequestError({ message: "A secret value tracking backfill is already running for this project" });
    }

    try {
      await secretValueTrackingQueue.startBackfill({ scope: "project", projectId: project.id });
    } catch (error) {
      await state.clear(project.id);
      throw error;
    }
  };

  const getProjectStatus = async (dto: TProjectPermission) => {
    const project = await $assertProjectSettingsEdit(dto);

    const runState = await state.read(project.id);
    return {
      ...resolveRunStatus(runState, Boolean(project.secretBlindIndexEnabled), new Date()),
      ...$progressOf(runState)
    };
  };

  return { enableForOrg, getOrgStatus, enableForProject, getProjectStatus };
};

export type TSecretValueTrackingServiceFactory = ReturnType<typeof secretValueTrackingServiceFactory>;
