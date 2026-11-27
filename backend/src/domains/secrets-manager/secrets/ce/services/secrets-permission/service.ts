import { ProjectType } from "@app/db/schemas";
import { roleHolderOf, TActorContext } from "@app/domains/lib/actor-context";
import { ReadFrom } from "@app/domains/lib/data-access";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { TTransaction } from "@app/domains/lib/transactions";
import {
  ActorGrants,
  Permission,
  Privilege,
  TActorGrantsService,
  TGrantActor,
  TGroupService
} from "@app/domains/platform/access-control/ce/module";
import {
  ProjectAccess,
  ProjectPermission,
  ProjectPermissionSet,
  StandardProjectRoles,
  TProjectPermissionAuditSource,
  TProjectPermissionService,
  TProjectsService
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { FolderGrant } from "../../models/folder-grant";
import { FolderGrants } from "../../models/folder-grants";
import { TFolderGrantCache, TFolderLocationStore, TMemberNameStore, TServiceTokenStore } from "../dependencies";
import { buildProjectMemberPermissions, TProjectMemberPermissions } from "./project-member-permissions";
import { SecretsPermissionTransaction, TSecretsPermissionTransaction } from "./secrets-permission-transaction";

export type TSecretsPermission = {
  permission: ProjectPermission;
  // Empty for a built-in admin (folder grants never restrict them) or a service token.
  folderGrants: FolderGrants;
};

// `grants` is only read to skip built-in admins.
export type TFolderGrantTargetInput = { target: TGrantActor; projectId: string; grants: ActorGrants };

export type TSecretsPermissionService = {
  // Every Secret Manager check goes through this. Folder grants override project roles at their folders; service
  // tokens get the scopes they were issued with.
  getSecretsPermission(input: { actor: TActorContext; projectId: string }): Promise<TSecretsPermission>;
  // Any project type. For shared checks that need the whole permission, like privilege boundaries.
  getProjectPermissionWithFolderGrants(input: { actor: TActorContext; projectId: string }): Promise<ProjectPermission>;
  // Folder grants included. The caller has to check the request may see them.
  getProjectMemberPermissions(input: { orgId: string; projectId: string }): Promise<TProjectMemberPermissions>;
  // Empty outside Secret Manager or for built-in admins. Pass the grants getPermissionAuditSources returned.
  getFolderGrantAuditSources(input: TFolderGrantTargetInput): Promise<TProjectPermissionAuditSource[]>;
  // One permission per grant (allow rules only), for privilege boundaries. Empty outside Secret Manager or for admins.
  getFolderGrantPermissions(input: TFolderGrantTargetInput): Promise<Permission<ProjectPermissionSet>[]>;
  // Changes when the actor's grants, the project's folder grants or its folder tree change. Use as a cache key.
  getPermissionFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // Read from the caches while fresh so a cache built on it (secret list ETag) never pairs a newer fingerprint with
  // older cached data.
  getPermissionCacheFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // Outside a transaction only. Inside one, use within(tx) so the bump commits with the change.
  invalidateFolderGrants(input: { projectIds: string[] }): Promise<void>;
  within(tx: TTransaction): TSecretsPermissionTransaction;
};

export class SecretsPermissionService implements TSecretsPermissionService {
  constructor(
    private readonly projectPermissionService: TProjectPermissionService,
    private readonly actorGrantsService: TActorGrantsService,
    private readonly groupService: TGroupService,
    private readonly projectsService: TProjectsService,
    private readonly serviceTokenStore: TServiceTokenStore,
    private readonly folderLocationStore: TFolderLocationStore,
    private readonly memberNameStore: TMemberNameStore,
    private readonly folderGrantCache: TFolderGrantCache
  ) {}

  async getSecretsPermission({
    actor,
    projectId
  }: {
    actor: TActorContext;
    projectId: string;
  }): Promise<TSecretsPermission> {
    if (actor.principal.type === ActorType.SERVICE) {
      return this.serviceTokenPermission({ actor, projectId });
    }

    const access = await this.projectPermissionService.getProjectAccess({
      actor,
      projectId,
      type: ProjectType.SecretManager
    });
    return this.withFolderGrants({ actor, access });
  }

  async getProjectPermissionWithFolderGrants({
    actor,
    projectId
  }: {
    actor: TActorContext;
    projectId: string;
  }): Promise<ProjectPermission> {
    if (actor.principal.type === ActorType.SERVICE) {
      const { permission } = await this.serviceTokenPermission({ actor, projectId, anyProjectType: true });
      return permission;
    }

    const access = await this.projectPermissionService.getProjectAccess({ actor, projectId });
    if (access.project.type !== ProjectType.SecretManager) return access.toPermission();
    return (await this.withFolderGrants({ actor, access })).permission;
  }

  async getProjectMemberPermissions({
    orgId,
    projectId
  }: {
    orgId: string;
    projectId: string;
  }): Promise<TProjectMemberPermissions> {
    const project = await this.projectsService.findProject(projectId);
    const [members, folderGrants] = await Promise.all([
      this.actorGrantsService.getProjectMemberGrants({ orgId, projectId }),
      project?.type === ProjectType.SecretManager
        ? this.actorGrantsService
            .listProjectFolderGrants({ projectId })
            .then((privileges) => this.locateFolderGrants(projectId, privileges))
        : Promise.resolve([])
    ]);
    const directMembers = members.directMembers();
    const [names, groups] = await Promise.all([
      this.memberNameStore.findNames({
        userIds: directMembers.flatMap(({ actor }) => (actor.type === ActorType.USER ? [actor.id] : [])),
        identityIds: directMembers.flatMap(({ actor }) => (actor.type === ActorType.IDENTITY ? [actor.id] : []))
      }),
      this.groupService.findGroupsByIds({ ids: members.groupMembers().map(({ groupId }) => groupId) })
    ]);
    const projectRoles = project
      ? this.projectPermissionService.getProjectRoles({ projectType: project.type })
      : StandardProjectRoles.generic(ProjectType.SecretManager);
    return buildProjectMemberPermissions({
      members,
      folderGrants,
      names,
      groups,
      standardRoles: StandardProjectRoles.generic(project?.type ?? ProjectType.SecretManager),
      projectRoles,
      now: new Date()
    });
  }

  async getFolderGrantAuditSources(input: TFolderGrantTargetInput): Promise<TProjectPermissionAuditSource[]> {
    return (await this.targetFolderGrants(input)).auditSources();
  }

  async getFolderGrantPermissions(input: TFolderGrantTargetInput): Promise<Permission<ProjectPermissionSet>[]> {
    return (await this.targetFolderGrants(input)).list.map((grant) => grant.allowPermission());
  }

  async getPermissionFingerprint({
    actor,
    orgId,
    projectId
  }: {
    actor: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<string> {
    const [grants, folderVersion] = await Promise.all([
      this.actorGrantsService.getGrantsFingerprint({ actor, orgId, projectId }),
      this.folderGrantCache.getFolderVersion(projectId)
    ]);
    return `${grants}:${folderVersion}`;
  }

  async getPermissionCacheFingerprint({
    actor,
    orgId,
    projectId
  }: {
    actor: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<string> {
    const grants = await this.actorGrantsService.getCachedGrantsFingerprint({ actor, orgId, projectId });
    // No live marker means the grants get revalidated against exactly this before they're served.
    const folderGrants =
      (await this.folderGrantCache.findLiveFingerprint({ actor, projectId })) ??
      `${grants}:${await this.folderGrantCache.getFolderVersion(projectId)}`;
    return `${grants}|${folderGrants}`;
  }

  invalidateFolderGrants({ projectIds }: { projectIds: string[] }): Promise<void> {
    return this.folderGrantCache.bumpFolderVersions({ projectIds });
  }

  within(tx: TTransaction): TSecretsPermissionTransaction {
    return new SecretsPermissionTransaction(this.folderGrantCache, tx);
  }

  // Expiry is filtered on every call so a temporary grant stops applying right when it ends.
  private async cachedFolderGrants({
    actor,
    orgId,
    projectId
  }: {
    actor: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<FolderGrants> {
    const grants = await this.folderGrantCache.getOrLoad({
      actor,
      projectId,
      fingerprint: () => this.getPermissionFingerprint({ actor, orgId, projectId }),
      load: async () =>
        this.locateFolderGrants(projectId, await this.actorGrantsService.listFolderGrants({ actor, projectId }))
    });
    return FolderGrants.inForce(grants);
  }

  // Not cached: audits and privilege boundaries need the grants as they are right now.
  private async targetFolderGrants({ target, projectId, grants }: TFolderGrantTargetInput): Promise<FolderGrants> {
    if (grants.hasActiveBuiltInRole("admin")) return FolderGrants.none();
    const project = await this.projectsService.findProject(projectId);
    if (project?.type !== ProjectType.SecretManager) return FolderGrants.none();
    const privileges = await this.actorGrantsService.listFolderGrants({ actor: target, projectId });
    return FolderGrants.inForce(await this.locateFolderGrants(projectId, privileges));
  }

  // From the primary: a replica still holding a renamed folder's old path would get cached under the newer folder
  // version.
  private async locateFolderGrants(projectId: string, privileges: Privilege[]): Promise<FolderGrant[]> {
    const withFolder = privileges.filter((privilege) => privilege.folderId && privilege.folderRole);
    const locations = await this.folderLocationStore.findLocations(
      projectId,
      withFolder.map((privilege) => privilege.folderId as string),
      { readFrom: ReadFrom.Primary }
    );
    return withFolder.flatMap((privilege, index) => {
      const location = locations[index];
      const grant = location ? FolderGrant.fromPrivilege(privilege, location) : null;
      return grant ? [grant] : [];
    });
  }

  private async withFolderGrants({
    actor,
    access
  }: {
    actor: TActorContext;
    access: ProjectAccess;
  }): Promise<TSecretsPermission> {
    // A folder grant can predate a promotion to admin, and it must never restrict an admin.
    const folderGrants = access.holdsBuiltInAdmin
      ? FolderGrants.none()
      : await this.cachedFolderGrants({
          actor: roleHolderOf(actor.principal, { projectId: access.project.id }),
          orgId: access.project.orgId,
          projectId: access.project.id
        });
    return { permission: access.toPermission({ overrides: folderGrants.rules() }), folderGrants };
  }

  private async serviceTokenPermission({
    actor,
    projectId,
    anyProjectType = false
  }: {
    actor: TActorContext;
    projectId: string;
    anyProjectType?: boolean;
  }): Promise<TSecretsPermission> {
    const serviceTokenId = actor.principal.id;
    const serviceToken = await this.serviceTokenStore.findById(serviceTokenId);
    if (!serviceToken)
      throw new EntityNotFoundError({ message: `Service token with ID '${serviceTokenId}' not found` });
    const tokenProject = await this.projectsService.findProject(serviceToken.projectId);
    const project = serviceToken.assertUsableIn({
      project: tokenProject,
      projectId,
      orgId: actor.org.id,
      anyProjectType
    });
    const permission = serviceToken.toPermission({
      project,
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
    });
    return { permission, folderGrants: FolderGrants.none() };
  }
}
