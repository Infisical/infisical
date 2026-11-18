import { ProjectMembershipRole } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectPermissionAuditSource,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import type { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

type TMemberPermissionAuditServiceFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  secretsPermissionService: TSecretsPermissionService;
};

export type TMemberPermissionAuditServiceFactory = ReturnType<typeof memberPermissionAuditServiceFactory>;

type TAuditInput = { actor: TActorContext; projectId: string; includeFolderPermissions: boolean };

// Where a project member's permission comes from: each role (direct and through groups), project-wide privilege
// and, in a Secret Manager project, folder grant, with its rules.
export const memberPermissionAuditServiceFactory = ({
  projectPermissionService,
  secretsPermissionService
}: TMemberPermissionAuditServiceFactoryDep) => {
  const $sources = async ({
    target,
    actor,
    projectId,
    includeFolderPermissions
  }: Omit<TAuditInput, "actor"> & { actor: TActorContext; target: TGrantActor }) => {
    const { sources, grants } = await projectPermissionService.getPermissionAuditSources({
      target,
      orgId: actor.org.id,
      projectId
    });
    const folderSources: TProjectPermissionAuditSource[] =
      includeFolderPermissions && !grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin)
        ? await secretsPermissionService.getFolderGrantAuditSources({ target, projectId, grants })
        : [];
    return { sources: [...sources, ...folderSources] };
  };

  const getMembershipPermissionAudit = async ({ targetUserId, ...input }: TAuditInput & { targetUserId: string }) => {
    const permission = await projectPermissionService.getProjectPermission({
      actor: input.actor,
      projectId: input.projectId
    });
    permission.assert({ action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member });
    return $sources({ ...input, target: { type: ActorType.USER, id: targetUserId } });
  };

  const getIdentityPermissionAudit = async ({
    targetIdentityId,
    ...input
  }: TAuditInput & { targetIdentityId: string }) => {
    const permission = await projectPermissionService.getProjectPermission({
      actor: input.actor,
      projectId: input.projectId
    });
    permission.assert({
      action: ProjectPermissionIdentityActions.Read,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: targetIdentityId }
    });
    return $sources({ ...input, target: { type: ActorType.IDENTITY, id: targetIdentityId } });
  };

  return { getMembershipPermissionAudit, getIdentityPermissionAudit };
};
