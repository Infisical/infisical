import { ProjectType } from "@app/db/schemas";
import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
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
  ProjectPermission,
  ProjectPermissionSet,
  StandardProjectRoles,
  TProjectPermissionAuditSource,
  TProjectPermissionService,
  TProjectsService
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject, TPrincipal } from "@app/lib/auth/principal";

import { FolderGrant } from "../../models/folder-grant";
import { FolderGrants } from "../../models/folder-grants";
import { TFolderGrantCache, TFolderLocationStore, TMemberNameStore, TServiceTokenStore } from "../dependencies";
import { buildProjectMemberPermissions, TProjectMemberPermissions } from "./project-member-permissions";
import { SecretsPermissionTransaction, TSecretsPermissionTransaction } from "./secrets-permission-transaction";

export type TSecretsPermission = {
  permission: ProjectPermission;
  // The actor's folder grants in force now: none for a built-in admin, whom they never restrict, or a service token.
  folderGrants: FolderGrants;
};

// A user or identity whose folder grants are read, with the grants it holds in the project (for the admin check).
export type TFolderGrantTargetInput = { target: TGrantActor; projectId: string; grants: ActorGrants };

export type TSecretsPermissionService = {
  // What the actor may do in a Secret Manager project: its project roles, with its folder grants deciding at their
  // folders. A service token gets the scopes it was issued with. Every Secret Manager check goes through it.
  getSecretsPermission(input: { actor: TActorContext; projectId: string }): Promise<TSecretsPermission>;
  // Every member's permission in the project (users, identities and groups), folder grants included, for listings
  // of who can reach a secret. The caller checks the request may see them.
  getProjectMemberPermissions(input: { orgId: string; projectId: string }): Promise<TProjectMemberPermissions>;
  // A member's active folder grants as permission audit sources; none outside Secret Manager or for a built-in
  // admin. Pass the grants getPermissionAuditSources returned for the member.
  getFolderGrantAuditSources(input: TFolderGrantTargetInput): Promise<TProjectPermissionAuditSource[]>;
  // Each of a member's active folder grants as a permission of its own (allow rules only), for privilege
  // boundaries; none outside Secret Manager or for a built-in admin.
  getFolderGrantPermissions(input: TFolderGrantTargetInput): Promise<Permission<ProjectPermissionSet>[]>;
  // Changes whenever the actor's Secret Manager permission in the project may have: its grants, or the project's
  // folder grants and folder tree. For caches of values derived from that permission.
  getPermissionFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // The fingerprint of the permission getSecretsPermission serves now, read from its caches while they are fresh, for
  // a cache of answers built on it (the secret list ETag): it never pairs a newer fingerprint with older cached data.
  getPermissionCacheFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // Makes cached folder grants of these projects revalidate, outside a transaction. A caller that changes a folder
  // grant or the folder tree in a transaction uses within(tx) instead, so the bump commits with the change.
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
      return this.serviceTokenPermission({ serviceTokenId: actor.principal.id, orgId: actor.org.id, projectId });
    }

    const access = await this.projectPermissionService.getProjectAccess({
      actor,
      projectId,
      type: ProjectType.SecretManager
    });
    // A folder grant can predate a promotion to admin; it must never restrict an admin.
    const folderGrants = access.isAdmin
      ? FolderGrants.none()
      : await this.cachedFolderGrants({
          actor: SecretsPermissionService.grantActorOf(actor.principal, projectId),
          orgId: access.project.orgId,
          projectId
        });
    return { permission: access.toPermission({ overrides: folderGrants.rules() }), folderGrants };
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
      standardRoles: projectRoles,
      projectRoles,
      now: new Date()
    });
  }

  async getFolderGrantAuditSources(input: TFolderGrantTargetInput): Promise<TProjectPermissionAuditSource[]> {
    return (await this.targetFolderGrants(input)).list.map((grant) => grant.toAuditSource());
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
    // Without a live marker the folder grants are checked again before they are served, against exactly this.
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

  // Cached with the actor's grants and revalidated against the folder version, then filtered for expiry on every
  // call, so a temporary grant stops applying the moment it ends.
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

  // Read fresh, not from the cache: an audit and a privilege boundary must see the grants as they are now.
  private async targetFolderGrants({ target, projectId, grants }: TFolderGrantTargetInput): Promise<FolderGrants> {
    if (grants.hasActiveBuiltInRole("admin")) return FolderGrants.none();
    const project = await this.projectsService.findProject(projectId);
    if (project?.type !== ProjectType.SecretManager) return FolderGrants.none();
    const privileges = await this.actorGrantsService.listFolderGrants({ actor: target, projectId });
    return FolderGrants.inForce(await this.locateFolderGrants(projectId, privileges));
  }

  // Each folder grant at its folder's location. A grant whose folder is gone, or that holds no role, grants nothing.
  private async locateFolderGrants(projectId: string, privileges: Privilege[]): Promise<FolderGrant[]> {
    const withFolder = privileges.filter((privilege) => privilege.folderId && privilege.folderRole);
    const locations = await this.folderLocationStore.findLocations(
      projectId,
      withFolder.map((privilege) => privilege.folderId as string)
    );
    return withFolder.flatMap((privilege, index) => {
      const location = locations[index];
      const grant = location ? FolderGrant.fromPrivilege(privilege, location) : null;
      return grant ? [grant] : [];
    });
  }

  private async serviceTokenPermission({
    serviceTokenId,
    orgId,
    projectId
  }: {
    serviceTokenId: string;
    orgId: string;
    projectId: string;
  }): Promise<TSecretsPermission> {
    const serviceToken = await this.serviceTokenStore.findById(serviceTokenId);
    if (!serviceToken)
      throw new EntityNotFoundError({ message: `Service token with ID '${serviceTokenId}' not found` });
    const tokenProject = await this.projectsService.findProject(serviceToken.projectId);
    const project = serviceToken.assertUsableIn({ project: tokenProject, projectId, orgId });
    return { permission: serviceToken.toPermission(project), folderGrants: FolderGrants.none() };
  }

  // Whose folder grants apply: the principal's, or those of the actor it assumed inside this project.
  private static grantActorOf(principal: TPrincipal, projectId: string): TGrantActor {
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new RuleViolationError({ message: "Invalid actor provided", name: "Get org permission" });
    }
    const { actorType, actorId } = effectiveActorForProject(principal, projectId);
    return { type: actorType, id: actorId };
  }
}
