import { AccessScope } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

const PROJECT_ACTION_BY_ORG_ACTION = {
  [OrgPermissionIdentityActions.EditAuth]: ProjectPermissionIdentityActions.EditAuth,
  [OrgPermissionIdentityActions.RevokeAuth]: ProjectPermissionIdentityActions.RevokeAuth,
  [OrgPermissionIdentityActions.CreateToken]: ProjectPermissionIdentityActions.CreateToken,
  [OrgPermissionIdentityActions.GetToken]: ProjectPermissionIdentityActions.GetToken,
  [OrgPermissionIdentityActions.DeleteToken]: ProjectPermissionIdentityActions.DeleteToken
} as const;

export type TIdentityAuthPermissionDeps = {
  orgPermissionService: TOrgPermissionService;
  projectPermissionService: TProjectPermissionService;
  secretsPermissionService: TSecretsPermissionService;
  actorGrantsService: TActorGrantsService;
};

type TAssertIdentityAuthAccessAllowedDTO = {
  identityId: string;
  identityName: string;
  orgId: string;
  projectId?: string | null;
  action: keyof typeof PROJECT_ACTION_BY_ORG_ACTION;
  baseMessage: string;
  actor: TActorContext;
};

// repointing an identity's auth or minting it a credential lets you log in as it, and listing its
// credentials shows what to attack. so you need the action, and on the legacy system you also have to
// out-rank every grant the target holds. the action check lives here because the legacy boundary alone
// passes for any target you cover, no-access identities included
export const assertIdentityAuthAccessAllowed = async (
  {
    orgPermissionService,
    projectPermissionService,
    secretsPermissionService,
    actorGrantsService
  }: TIdentityAuthPermissionDeps,
  { identityId, identityName, orgId, projectId, action, baseMessage, actor }: TAssertIdentityAuthAccessAllowedDTO
) => {
  const { shouldUseNewPrivilegeSystem } = actor.org;
  const target = { type: ActorType.IDENTITY, id: identityId } as const;

  if (projectId) {
    const permission = await secretsPermissionService.getProjectPermissionWithFolderGrants({ actor, projectId });

    permission.assert({
      action: PROJECT_ACTION_BY_ORG_ACTION[action],
      subject: ProjectPermissionSub.Identity,
      fields: { identityId }
    });
    if (shouldUseNewPrivilegeSystem) return;

    const [roleGrants, grants] = await Promise.all([
      projectPermissionService.getGrantPermissions({ actor: { ...target, name: identityName }, orgId, projectId }),
      actorGrantsService.getActorGrants({ actor: target, scope: { scope: AccessScope.Project, orgId, projectId } })
    ]);
    const folderGrants = await secretsPermissionService.getFolderGrantPermissions({ target, projectId, grants });

    permission.assertBounds({
      actions: PROJECT_ACTION_BY_ORG_ACTION[action],
      subject: ProjectPermissionSub.Identity,
      fields: { identityId },
      targets: [...roleGrants, ...folderGrants].map((grant) => ({ permission: grant })),
      message: baseMessage
    });
    return;
  }

  const permission = await orgPermissionService.getOrgPermission({ actor, orgId });

  permission.assert({ action, subject: OrgPermissionSubjects.Identity });
  if (shouldUseNewPrivilegeSystem) return;

  const roleGrants = await orgPermissionService.getGrantPermissions({
    actor: { ...target, name: identityName },
    orgId
  });
  permission.assertBounds({
    actions: action,
    subject: OrgPermissionSubjects.Identity,
    targets: roleGrants.map((grant) => ({ permission: grant })),
    message: baseMessage
  });
};
