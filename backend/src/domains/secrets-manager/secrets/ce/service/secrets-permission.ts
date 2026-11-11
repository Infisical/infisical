import { Knex } from "knex";

import { ProjectType, ServiceTokenScopes } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import {
  ActorGrants,
  overrideAt,
  TAccessControlDomain,
  TGrantActor
} from "@app/domains/platform/access-control/ce/module";
import {
  buildServiceTokenProjectPermission,
  ProjectPermission,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { FolderPathDataAccess } from "../data-access/folder-path-data-access";
import { ServiceTokenDataAccess } from "../data-access/service-token-data-access";
import { buildFolderScopedPrivilegeRules, TFolderGrant } from "./folder-grant-rules";

export type TSecretsPermission = {
  permission: ProjectPermission;
  // The actor's folder grants in force now (none for a built-in admin, who does not get them).
  folderGrants: TFolderGrant[];
};

export type TSecretsPermissionDeps = {
  projectsDomain: Pick<TProjectsDomain, "getProjectRules" | "findProject">;
  accessControlDomain: Pick<TAccessControlDomain, "findFolderGrants" | "withCache" | "grantsFingerprint">;
  keyStore: Pick<TDomainKeyStore, "pgGetIntItem" | "pgIncrementBy">;
  folderPaths: Pick<FolderPathDataAccess, "findLocations">;
  serviceTokens: Pick<ServiceTokenDataAccess, "findById">;
};

type TCachedFolderGrant = TFolderGrant & { isTemporary: boolean; temporaryAccessEndTime: string | null };

// Bumped whenever a folder grant or the folder tree of the project changes (invalidateProjectFolderPermissionCache).
const folderVersionKey = (projectId: string) => `project-folder-permission-version:${projectId}`;

const FOLDER_GRANTS_CACHE_KEY = "secrets-folder-grants:v1";

// Must comfortably exceed the cached permission's lifetime: an expired row reads as 0 and the next bump re-inserts at
// 1, so a short expiry lets a live cached value's fingerprint collide with the resurrected counter.
const FOLDER_VERSION_TTL = "2d";

export class SecretsPermissionService {
  constructor(private readonly deps: TSecretsPermissionDeps) {}

  // What the actor may do in a Secret Manager project: its project roles, with its folder grants overriding them
  // at their folders. A service token gets the scopes it was issued with.
  async getSecretsPermission({
    actor,
    projectId
  }: {
    actor: TActorContext;
    projectId: string;
  }): Promise<TSecretsPermission> {
    if (actor.principal.type === ActorType.SERVICE) return this.serviceTokenPermission({ actor, projectId });

    const base = await this.deps.projectsDomain.getProjectRules({ actor, projectId, type: ProjectType.SecretManager });
    // A folder grant can predate a promotion to admin; it must never restrict an admin.
    const folderGrants = base.grants.hasActiveBuiltInRole("admin")
      ? []
      : await this.activeFolderGrants({ grantActor: base.actor, orgId: base.project.orgId, projectId });
    const rules = overrideAt({ base: base.roleRules, overrides: buildFolderScopedPrivilegeRules(folderGrants) });

    return {
      permission: ProjectPermission.build({
        project: base.project,
        grants: base.grants,
        principal: base.principal,
        identity: base.identity,
        rules
      }),
      folderGrants
    };
  }

  // Makes every cached folder grant of these projects revalidate: call it when a folder grant changes or a folder is
  // moved, renamed or deleted. Pass the transaction the change is written in so the bump commits with it.
  async invalidateFolderGrants({ projectIds, tx }: { projectIds: string[]; tx?: Knex }): Promise<void> {
    for await (const projectId of [...new Set(projectIds.filter(Boolean))]) {
      await this.deps.keyStore.pgIncrementBy(folderVersionKey(projectId), { incr: 1, tx, expiry: FOLDER_VERSION_TTL });
    }
  }

  // A key that changes whenever the actor's Secret Manager permission in the project may have: its grants or the
  // project's folder grants and folder tree. For caches of values derived from that permission.
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
      this.deps.accessControlDomain.grantsFingerprint({ actor, scope: { orgId, projectId } }),
      this.deps.keyStore.pgGetIntItem(folderVersionKey(projectId))
    ]);
    return `${grants}:${folderVersion ?? 0}`;
  }

  // Cached with the actor's grants and revalidated against the folder version, then filtered for expiry on every
  // call, so a temporary grant stops applying the moment it ends.
  private async activeFolderGrants({
    grantActor,
    orgId,
    projectId
  }: {
    grantActor: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<TFolderGrant[]> {
    const cached = await this.deps.accessControlDomain.withCache<TCachedFolderGrant[]>({
      key: FOLDER_GRANTS_CACHE_KEY,
      actor: grantActor,
      scope: { orgId, projectId },
      extraFingerprint: async () => String((await this.deps.keyStore.pgGetIntItem(folderVersionKey(projectId))) ?? 0),
      compute: async () => {
        const privileges = await this.deps.accessControlDomain.findFolderGrants({ actor: grantActor, projectId });
        const locations = await this.deps.folderPaths.findLocations(
          projectId,
          privileges.map((privilege) => privilege.folderId as string)
        );
        // A grant whose folder is gone grants nothing.
        return privileges.flatMap((privilege, index) => {
          const location = locations[index];
          const { role, isTemporary, temporaryAccessEndTime } = privilege.toJSON();
          if (!location || !role) return [];
          return [
            {
              id: privilege.id,
              folderId: privilege.folderId as string,
              role,
              environmentSlug: location.environmentSlug,
              secretPath: location.path,
              isTemporary: Boolean(isTemporary),
              temporaryAccessEndTime: temporaryAccessEndTime ? new Date(temporaryAccessEndTime).toISOString() : null
            }
          ];
        });
      }
    });
    const now = Date.now();
    return cached
      .filter(
        (grant) =>
          !grant.isTemporary || Boolean(grant.temporaryAccessEndTime && now < Date.parse(grant.temporaryAccessEndTime))
      )
      .map(({ id, folderId, role, environmentSlug, secretPath }) => ({
        id,
        folderId,
        role,
        environmentSlug,
        secretPath
      }));
  }

  private async serviceTokenPermission({
    actor,
    projectId
  }: {
    actor: TActorContext;
    projectId: string;
  }): Promise<TSecretsPermission> {
    const serviceTokenId = actor.principal.id;
    const serviceToken = await this.deps.serviceTokens.findById(serviceTokenId);
    if (!serviceToken) throw new NotFoundError({ message: `Service token with ID '${serviceTokenId}' not found` });
    const project = await this.deps.projectsDomain.findProject({ projectId: serviceToken.projectId });
    if (!project) throw new BadRequestError({ message: "Service token not linked to a project" });
    if (serviceToken.projectId !== projectId) {
      throw new ForbiddenRequestError({
        message: `Service token not a part of the specified project with ID ${projectId}`
      });
    }
    if (project.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({
        message: `Service token not a part of the specified organization with ID ${actor.org.id}`
      });
    }
    if (project.type !== ProjectType.SecretManager) {
      throw new BadRequestError({
        message: `The project is of type ${project.type}. Operations of type ${ProjectType.SecretManager} are not allowed.`
      });
    }

    const scopes = ServiceTokenScopes.parse(serviceToken.scopes || []);
    return {
      permission: ProjectPermission.build({
        project,
        grants: ActorGrants.empty(),
        principal: actor.principal,
        identity: { id: serviceTokenId, username: "", metadata: {}, auth: {} },
        rules: buildServiceTokenProjectPermission(scopes, serviceToken.permissions).rules
      }),
      folderGrants: []
    };
  }
}
