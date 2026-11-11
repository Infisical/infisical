import { MongoAbility } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { ActorType } from "@app/lib/auth/actor-types";

const PROJECT_ACTION_BY_ORG_ACTION = {
  [OrgPermissionIdentityActions.EditAuth]: ProjectPermissionIdentityActions.EditAuth,
  [OrgPermissionIdentityActions.RevokeAuth]: ProjectPermissionIdentityActions.RevokeAuth,
  [OrgPermissionIdentityActions.CreateToken]: ProjectPermissionIdentityActions.CreateToken,
  [OrgPermissionIdentityActions.GetToken]: ProjectPermissionIdentityActions.GetToken,
  [OrgPermissionIdentityActions.DeleteToken]: ProjectPermissionIdentityActions.DeleteToken
} as const;

export type TIdentityAuthPermissionDeps = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission" | "getGrantPermissions">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission" | "getGrantPermissions">;
  secretsDomain: Pick<TSecretsDomain, "getFolderGrantPermissions">;
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants">;
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
  { organizationsDomain, projectsDomain, secretsDomain, accessControlDomain }: TIdentityAuthPermissionDeps,
  { identityId, identityName, orgId, projectId, action, baseMessage, actor }: TAssertIdentityAuthAccessAllowedDTO
) => {
  const { shouldUseNewPrivilegeSystem } = actor.org;
  const target = { type: ActorType.IDENTITY, id: identityId } as const;

  if (projectId) {
    const permission = await projectsDomain.getProjectPermission({ actor, projectId });

    permission.assert({
      action: PROJECT_ACTION_BY_ORG_ACTION[action],
      subject: ProjectPermissionSub.Identity,
      fields: { identityId }
    });
    if (shouldUseNewPrivilegeSystem) return;

    const [roleGrants, grants] = await Promise.all([
      projectsDomain.getGrantPermissions({ actor: { ...target, name: identityName }, orgId, projectId }),
      accessControlDomain.fetchGrants({ actor: target, scope: { scope: AccessScope.Project, orgId, projectId } })
    ]);
    const folderGrants = await secretsDomain.getFolderGrantPermissions({ target, projectId, grants });

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: PROJECT_ACTION_BY_ORG_ACTION[action],
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission.toAbility() as MongoAbility,
      targetPermissions: [...roleGrants, ...folderGrants].map((grant) => ({
        permission: grant.toAbility() as MongoAbility
      })),
      baseMessage,
      subjectFields: { identityId }
    });
    return;
  }

  const permission = await organizationsDomain.getOrgPermission({ actor, orgId });

  permission.assert({ action, subject: OrgPermissionSubjects.Identity });
  if (shouldUseNewPrivilegeSystem) return;

  const roleGrants = await organizationsDomain.getGrantPermissions({ actor: { ...target, name: identityName }, orgId });
  assertRoleSetBoundary({
    shouldUseNewPrivilegeSystem,
    opActions: action,
    opSubject: OrgPermissionSubjects.Identity,
    actorPermission: permission.toAbility() as MongoAbility,
    targetPermissions: roleGrants.map((grant) => ({ permission: grant.toAbility() as MongoAbility })),
    baseMessage
  });
};
