/* eslint-disable class-methods-use-this */
import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ActorGrants,
  Permission,
  RuleIdentity,
  RuleSet,
  TGrantActor
} from "@app/domains/platform/access-control/ce/module";
import {
  Project,
  ProjectPermission,
  ProjectPermissionSet,
  TProjectPermissionAuditSource,
  TProjectRule
} from "@app/domains/platform/projects/ce/module";

import { FolderGrant } from "../models/folder-grant";
import { FolderGrants } from "../models/folder-grants";
import { TProjectMemberPermissions } from "../services/secrets-permission/project-member-permissions";
import { TSecretsPermission, TSecretsPermissionService } from "../services/secrets-permission/service";

// For tests of code that checks Secret Manager permissions: every actor gets `rules` in any project, with
// `folderGrants` layered over them the way the real service layers them. Set both, or replace a method.
export class FakeSecretsPermissionService implements TSecretsPermissionService {
  rules: TProjectRule[] = [];

  folderGrants: FolderGrant[] = [];

  folderVersions = new Map<string, number>();

  getSecretsPermission = async ({
    actor,
    projectId
  }: {
    actor: TActorContext;
    projectId: string;
  }): Promise<TSecretsPermission> => {
    const folderGrants = FolderGrants.inForce(this.folderGrants);
    const project = Project.restore({
      id: projectId,
      name: projectId,
      slug: projectId,
      orgId: actor.org.id,
      type: ProjectType.SecretManager,
      enforceEncryptedSecretManagerSecretMetadata: false
    });
    return {
      permission: ProjectPermission.build({
        rules: RuleSet.merge([this.rules]).then(folderGrants.rules()),
        project,
        grants: ActorGrants.empty(),
        principal: actor.principal,
        identity: RuleIdentity.create({ id: actor.principal.id, username: "", metadata: {} })
      }),
      folderGrants
    };
  };

  getProjectMemberPermissions = async (): Promise<TProjectMemberPermissions> => ({
    userPermissions: [],
    identityPermissions: [],
    groupPermissions: [],
    folderAccessByActorId: new Map(),
    permissionForActor: () => Permission.none<ProjectPermissionSet>(),
    groupRulesHavePlaceholders: false
  });

  getFolderGrantAuditSources = async (): Promise<TProjectPermissionAuditSource[]> =>
    FolderGrants.inForce(this.folderGrants).list.map((grant) => grant.toAuditSource());

  getFolderGrantPermissions = async (): Promise<Permission<ProjectPermissionSet>[]> =>
    FolderGrants.inForce(this.folderGrants).list.map((grant) => grant.allowPermission());

  getPermissionFingerprint = async ({ actor, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) =>
    `${actor.type}:${actor.id}:${this.folderVersions.get(projectId) ?? 0}`;

  getPermissionCacheFingerprint = async (input: { actor: TGrantActor; orgId: string; projectId: string }) =>
    this.getPermissionFingerprint(input);

  invalidateFolderGrants = async ({ projectIds }: { projectIds: string[] }) => {
    [...new Set(projectIds.filter(Boolean))].forEach((projectId) =>
      this.folderVersions.set(projectId, (this.folderVersions.get(projectId) ?? 0) + 1)
    );
  };

  within = () => ({ invalidateFolderGrants: this.invalidateFolderGrants });
}
