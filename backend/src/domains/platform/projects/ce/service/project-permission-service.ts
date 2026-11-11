import { MongoAbility } from "@casl/ability";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import {
  ActorGrants,
  escapeHandlebarsMissingDict,
  mergeRoles,
  reviveActorGrants,
  TAccessControlDomain,
  TActorGrantsProps,
  TGrantActor,
  unpackCustomRules
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject, TPrincipal } from "@app/lib/auth/principal";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ProjectDataAccess } from "../data-access/project-data-access";
import { Project, TProjectProps } from "../model/project";
import { expandLegacyForbidActions } from "./permission/legacy-forbid-expansion";
import { ProjectPermissionSet } from "./permission/project-permission";
import { ProductAccessRegistry, TProjectRule } from "./product-access-registry";
import { ProjectPermission, TProjectIdentityContext } from "./project-access";

export type TGetProjectPermissionInput = {
  actor: TActorContext;
  projectId: string;
  // The product the call is for. A project of another type is refused; omit it for checks every project type shares.
  type?: ProjectType;
};

// A project's role rules for an actor, before its product adds anything: what a product function composes on.
export type TProjectRules = {
  project: Project;
  grants: ActorGrants;
  // The actor's roles resolved for this project type, cannot rules last.
  roleRules: TProjectRule[];
  principal: TPrincipal;
  // Whose grants these are: the principal, or the actor it assumed inside this project.
  actor: TGrantActor;
  identity: TProjectIdentityContext;
};

export type TProjectPermissionServiceDeps = {
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants" | "withCache">;
  projects: Pick<ProjectDataAccess, "findById" | "findDeletionState">;
  registry: ProductAccessRegistry;
  memo: ActorMemo<{ project: Project; grants: ActorGrants }>;
};

// Bump when the cached shape changes, so a deploy never reads an older blob.
const CACHE_KEY = "project-grants:v1";

type TCachedProjectGrants = { project: TProjectProps; grants: TActorGrantsProps };

export class ProjectPermissionService {
  constructor(private readonly deps: TProjectPermissionServiceDeps) {}

  async getProjectRules({ actor, projectId, type }: TGetProjectPermissionInput): Promise<TProjectRules> {
    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Invalid actor provided", name: "Get project permission" });
    }
    // An assumed privilege applies only inside its own project.
    const effective = effectiveActorForProject(principal, projectId);
    const grantActor: TGrantActor = { type: effective.actorType, id: effective.actorId };

    const { project, grants } = await this.deps.memo.getOrCompute(actor, projectId, () =>
      this.loadProjectGrants({ projectId, grantActor })
    );

    if (project.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "This project does not belong to your selected organization." });
    }
    if (type && type !== project.type) {
      throw new BadRequestError({
        message: `The project is of type ${project.type}. Operations of type ${type} are not allowed.`
      });
    }
    if (!grants.hasMembership) {
      throw new ForbiddenRequestError({
        name: "ProjectMembershipNotFound",
        message: `You are not a member of this project with ID ${projectId}. Please assign this ${grantActor.type} to the project with the appropriate permissions, then try again.`
      });
    }

    return {
      project,
      grants,
      roleRules: this.resolveRoles({ project, grants }),
      principal,
      actor: grantActor,
      identity: ProjectPermissionService.identityContext({ principal, grantActor, grants })
    };
  }

  async getProjectPermission(input: TGetProjectPermissionInput): Promise<ProjectPermission> {
    const { roleRules, project, grants, principal, identity } = await this.getProjectRules(input);
    return ProjectPermission.build({ project, grants, principal, identity, rules: roleRules });
  }

  // The project and the actor's grants in it, cached across requests and revalidated against the grants'
  // fingerprint and whether the project is being deleted.
  private async loadProjectGrants({ projectId, grantActor }: { projectId: string; grantActor: TGrantActor }) {
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ${projectId} not found` });

    const cached = await this.deps.accessControlDomain.withCache<TCachedProjectGrants>({
      key: CACHE_KEY,
      actor: grantActor,
      scope: { orgId: project.orgId, projectId },
      extraFingerprint: () => this.deps.projects.findDeletionState(projectId),
      compute: async () => {
        const grants = await this.deps.accessControlDomain.fetchGrants({
          actor: grantActor,
          scope: { scope: AccessScope.Project, orgId: project.orgId, projectId }
        });
        return { project: project.toJSON(), grants: grants.toJSON() };
      }
    });
    return { project: Project.restore(cached.project), grants: reviveActorGrants(cached.grants) };
  }

  // Each active role resolved through what the project's product registered: its default roles (or the generic
  // ones), and its override for custom roles (or the customer's rules as written).
  private resolveRoles({ project, grants }: { project: Project; grants: ActorGrants }): TProjectRule[] {
    const defaults = this.deps.registry.defaultRolesFor(project.type);
    const resolveCustom = this.deps.registry.customRoleResolverFor(project.type);
    const rules = grants.activeEntries(ProjectMembershipRole.Custom).flatMap(({ role, permissions }) => {
      if (role === ProjectMembershipRole.Custom) {
        const customRules = unpackCustomRules<MongoAbility<ProjectPermissionSet>>(permissions);
        return resolveCustom ? resolveCustom({ customRules, project, grants }) : customRules;
      }
      const roleRules = defaults[role];
      if (roleRules) return roleRules;
      // A slug whose product was removed (ssh-host-bootstrapper) grants nothing, so the actor's other roles keep
      // working. The logger is only initialised by the server; tests and scripts run without it.
      logger?.warn(
        `Projects: unknown project role slug, granting no rules [role=${role}] [projectType=${project.type}]`
      );
      return [];
    });
    return mergeRoles({ layers: [expandLegacyForbidActions(rules)] });
  }

  private static identityContext({
    principal,
    grantActor,
    grants
  }: {
    principal: TPrincipal;
    grantActor: TGrantActor;
    grants: ActorGrants;
  }): TProjectIdentityContext {
    const isPrincipal = principal.id === grantActor.id;
    let username = "";
    if (isPrincipal && principal.type === ActorType.USER) username = principal.username;
    if (isPrincipal && principal.type === ActorType.IDENTITY) username = principal.name;
    if (!isPrincipal && "assumed" in principal) username = principal.assumed?.actorName ?? "";
    // identity.auth is knowable only for the identity making the request.
    const auth =
      isPrincipal && principal.type === ActorType.IDENTITY && principal.authInfo
        ? escapeHandlebarsMissingDict(principal.authInfo as Record<string, string>, "identity.auth")
        : {};
    return {
      id: grantActor.id,
      username,
      metadata: escapeHandlebarsMissingDict(grants.attributeMap(), "identity.metadata"),
      auth
    };
  }
}
