import { MongoAbility } from "@casl/ability";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  ActorGrants,
  mergeRoles,
  TGrantEntry,
  unpackCustomRules
} from "@app/domains/platform/access-control/ce/module";
import { logger } from "@app/lib/logger";

import { Project } from "../model/project";
import { expandLegacyForbidActions } from "./permission/legacy-forbid-expansion";
import { ProjectPermissionSet } from "./permission/project-permission";
import { genericProjectRoles } from "./permission/project-roles";
import { ProductAccessRegistry, TProjectRule } from "./product-access-registry";

// Turns role and privilege entries into project rules the way the project's product registered them: its default
// roles (or the generic ones), and its override for custom roles (or the customer's rules as written). Without a
// project (it was deleted), the generic roles apply.
export class ProjectRoleRules {
  constructor(private readonly registry: ProductAccessRegistry) {}

  resolveEntry({
    entry: { role, permissions },
    project,
    grants
  }: {
    entry: TGrantEntry;
    project?: Project;
    grants: ActorGrants;
  }): TProjectRule[] {
    if (role === ProjectMembershipRole.Custom) {
      const customRules = unpackCustomRules<MongoAbility<ProjectPermissionSet>>(permissions);
      const resolveCustom = project ? this.registry.customRoleResolverFor(project.type) : undefined;
      return resolveCustom && project ? resolveCustom({ customRules, project, grants }) : customRules;
    }
    const defaults: Record<string, TProjectRule[]> = project
      ? this.registry.defaultRolesFor(project.type)
      : genericProjectRoles;
    const roleRules = defaults[role];
    if (roleRules) return roleRules;
    // A slug whose product was removed (ssh-host-bootstrapper) grants nothing, so the actor's other roles keep
    // working. The logger is only initialised by the server; tests and scripts run without it.
    logger?.warn(
      `Projects: unknown project role slug, granting no rules [role=${role}] [projectType=${project?.type}]`
    );
    return [];
  }

  // Every entry resolved, legacy forbids expanded, cannot rules last.
  resolve({
    entries,
    project,
    grants
  }: {
    entries: TGrantEntry[];
    project?: Project;
    grants: ActorGrants;
  }): TProjectRule[] {
    const rules = entries.flatMap((entry) => this.resolveEntry({ entry, project, grants }));
    return mergeRoles({ layers: [expandLegacyForbidActions(rules)] });
  }
}
