import { PackRule, packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import {
  ActorGrants,
  escapeHandlebarsMissingDict,
  interpolateStoredIdentityRules,
  Permission,
  TAccessControlDomain,
  TGrantActor
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { NotFoundError } from "@app/lib/errors";

import { ProjectDataAccess } from "../data-access/project-data-access";
import { Project } from "../model/project";
import { ProjectPermissionSet } from "./permission/project-permission";
import { TProjectRule } from "./product-access-registry";
import { ProjectRoleRules } from "./project-role-rules";

export type TProjectRolePermission = {
  permission: Permission<ProjectPermissionSet>;
  // The custom role, or the built-in slug as its own name.
  role: { name: string; slug: string; id?: string; description?: string | null; permissions?: unknown };
};

// One of the roles or project-wide privileges an actor holds in a project, as a permission audit shows it.
export type TProjectPermissionAuditSource = {
  id: string;
  type: "role" | "group_role" | "additional_privilege";
  name: string;
  slug?: string;
  groupId?: string;
  groupName?: string;
  isTemporary: boolean;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
  permissions: PackRule<TProjectRule>[];
};

export type TProjectMemberAccessDeps = {
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants" | "findRolesBySlugs" | "findGroupsByIds">;
  projects: Pick<ProjectDataAccess, "findById">;
  roleRules: ProjectRoleRules;
};

// Permissions built from roles and grants rather than for the actor making the request: a role set to compare an
// actor's privileges against, each grant of another member, and a member's permission audit. Callers check that
// the request may see them.
export class ProjectMemberAccess {
  constructor(private readonly deps: TProjectMemberAccessDeps) {}

  // Each slug as a permission of its own, resolved for the project's product: built-in slugs as the product
  // defines them, custom slugs from the project's custom roles. Refuses a slug with no role unless told to skip it.
  async getProjectPermissionByRoles({
    projectId,
    roles,
    ignoreUnresolvedRoles = false
  }: {
    projectId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TProjectRolePermission[]> {
    const isBuiltIn = (slug: string) => Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);
    const project = await this.deps.projects.findById(projectId);
    const customSlugs = roles.filter((slug) => !isBuiltIn(slug));
    const customRoles = await this.deps.accessControlDomain.findRolesBySlugs({
      owner: { projectId },
      slugs: customSlugs
    });
    const bySlug = new Map(customRoles.map((role) => [role.slug, role]));
    const missing = customSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length && !ignoreUnresolvedRoles) {
      throw new NotFoundError({
        message: `Specified roles '${missing.join(",")}' was not found in the project with ID '${projectId}'`
      });
    }
    const grants = ActorGrants.empty();
    return roles.flatMap((slug) => {
      if (isBuiltIn(slug)) {
        return [
          {
            permission: this.permissionOf({ project, grants, entries: [{ role: slug }] }),
            role: { name: slug, slug }
          }
        ];
      }
      const role = bySlug.get(slug);
      if (!role) return [];
      return [
        {
          permission: this.permissionOf({
            project,
            grants,
            entries: [{ role: ProjectMembershipRole.Custom, permissions: role.permissions || [] }]
          }),
          role: role.toJSON()
        }
      ];
    });
  }

  // Each active role and project-wide privilege another user or identity holds in the project, as a permission of
  // its own with its `{{identity.*}}` placeholders filled in. The caller passes the actor's name.
  async getGrantPermissions({
    actor,
    orgId,
    projectId
  }: {
    actor: TGrantActor & { name: string };
    orgId: string;
    projectId: string;
  }): Promise<Permission<ProjectPermissionSet>[]> {
    const [project, grants] = await Promise.all([
      this.deps.projects.findById(projectId),
      this.deps.accessControlDomain.fetchGrants({
        actor: { type: actor.type, id: actor.id },
        scope: { scope: AccessScope.Project, orgId, projectId }
      })
    ]);
    const identity = {
      id: actor.id,
      username: actor.name,
      metadata: escapeHandlebarsMissingDict(grants.attributeMap(), "identity.metadata")
    };
    return grants.activeEntries(ProjectMembershipRole.Custom).map((entry) => {
      const rules = this.deps.roleRules.resolve({ entries: [entry], project, grants });
      return Permission.fromRules({ rules: interpolateStoredIdentityRules(rules, { identity }) });
    });
  }

  // The roles (direct and through groups) and project-wide privileges a user or identity holds in the project, for
  // its permission audit. Folder grants belong to Secrets, which adds them for its projects.
  async getPermissionAuditSources({
    target,
    orgId,
    projectId
  }: {
    target: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<{ sources: TProjectPermissionAuditSource[]; grants: ActorGrants }> {
    const [project, grants] = await Promise.all([
      this.deps.projects.findById(projectId),
      this.deps.accessControlDomain.fetchGrants({
        actor: target,
        scope: { scope: AccessScope.Project, orgId, projectId }
      })
    ]);
    if (!grants.hasMembership) {
      const label = target.type === ActorType.USER ? "user" : "identity";
      const idName = target.type === ActorType.USER ? "targetUserId" : "targetIdentityId";
      throw new NotFoundError({
        message: `Target ${label} with ID '${target.id}' is not a member of project with ID '${projectId}' [${idName}=${target.id}] [projectId=${projectId}]`
      });
    }
    const groupIds = [
      ...new Set(grants.memberships.flatMap((membership) => (membership.viaGroupId ? [membership.viaGroupId] : [])))
    ];
    const groups = await this.deps.accessControlDomain.findGroupsByIds({ ids: groupIds });
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const pack = (entries: { role: string; permissions?: unknown }[]) =>
      packRules(this.deps.roleRules.resolve({ entries, project, grants }));

    const now = new Date();
    const sources: TProjectPermissionAuditSource[] = grants.memberships.flatMap((membership) => {
      const groupId = membership.viaGroupId ?? undefined;
      return membership.activeRoles(now).map((role): TProjectPermissionAuditSource => {
        const isCustom = role.role === ProjectMembershipRole.Custom;
        return {
          id: role.id,
          type: groupId ? "group_role" : "role",
          name: isCustom ? role.customRoleName || role.customRoleSlug || "Custom" : role.role,
          slug: isCustom ? ProjectMembershipRole.Custom : role.role,
          groupId,
          groupName: groupId ? groupNameById.get(groupId) : undefined,
          isTemporary: role.isTemporary,
          temporaryAccessStartTime: role.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: role.temporaryAccessEndTime?.toISOString(),
          permissions: pack([{ role: role.role, permissions: isCustom ? role.customRolePermissions : [] }])
        };
      });
    });
    grants.privileges
      .filter((privilege) => privilege.isActive(now))
      .forEach((privilege) => {
        sources.push({
          id: privilege.id,
          type: "additional_privilege",
          name: privilege.name || "Additional Privilege",
          isTemporary: privilege.isTemporary,
          temporaryAccessStartTime: privilege.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: privilege.temporaryAccessEndTime?.toISOString(),
          permissions: pack([{ role: ProjectMembershipRole.Custom, permissions: privilege.permissions }])
        });
      });
    return { sources, grants };
  }

  private permissionOf({
    project,
    grants,
    entries
  }: {
    project?: Project;
    grants: ActorGrants;
    entries: { role: string; permissions?: unknown }[];
  }): Permission<ProjectPermissionSet> {
    return Permission.fromRules({ rules: this.deps.roleRules.resolve({ entries, project, grants }) });
  }
}
