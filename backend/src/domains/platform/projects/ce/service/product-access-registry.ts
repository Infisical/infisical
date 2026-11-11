import { MongoAbility, RawRuleOf } from "@casl/ability";

import { ProjectType } from "@app/db/schemas";
import type { ActorGrants } from "@app/domains/platform/access-control/ce/module";

import { Project } from "../model/project";
import { ProjectPermissionSet } from "./permission/project-permission";
import { genericProjectRoles } from "./permission/project-roles";

export type TProjectRule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

// What a customer's custom role (or an additional privilege) means in a product's projects: given the customer's
// rules, the rules to apply.
export type TCustomRoleResolver = (input: {
  customRules: TProjectRule[];
  project: Project;
  grants: ActorGrants;
}) => TProjectRule[];

// How each product's projects behave for access control. A product registers from its own module constructor; a
// project type nobody registers for gets the generic roles and applies custom roles as written.
export type TProductAccessRegistry = {
  // The built-in roles in this product's projects: slug -> rules. Replaces the generic set, so a product that only
  // adds a role spreads genericProjectRoles in.
  registerDefaultRoles: (input: { projectType: ProjectType; roles: Record<string, TProjectRule[]> }) => void;
  // Overrides what custom roles mean in this product's projects. Default: apply the customer's rules as written.
  overrideCustomRoles: (input: { projectType: ProjectType; resolve: TCustomRoleResolver }) => void;
};

export class ProductAccessRegistry implements TProductAccessRegistry {
  private readonly defaultRoles = new Map<ProjectType, Record<string, TProjectRule[]>>();

  private readonly customRoles = new Map<ProjectType, TCustomRoleResolver>();

  registerDefaultRoles({ projectType, roles }: { projectType: ProjectType; roles: Record<string, TProjectRule[]> }) {
    if (this.defaultRoles.has(projectType)) {
      throw new Error(`Default roles for project type '${projectType}' are already registered`);
    }
    this.defaultRoles.set(projectType, roles);
  }

  overrideCustomRoles({ projectType, resolve }: { projectType: ProjectType; resolve: TCustomRoleResolver }) {
    if (this.customRoles.has(projectType)) {
      throw new Error(`Custom roles for project type '${projectType}' are already overridden`);
    }
    this.customRoles.set(projectType, resolve);
  }

  defaultRolesFor(projectType: ProjectType): Record<string, TProjectRule[]> {
    return this.defaultRoles.get(projectType) ?? genericProjectRoles;
  }

  customRoleResolverFor(projectType: ProjectType): TCustomRoleResolver | undefined {
    return this.customRoles.get(projectType);
  }

  registeredProjectTypes(): { defaultRoles: ProjectType[]; customRoles: ProjectType[] } {
    return { defaultRoles: [...this.defaultRoles.keys()], customRoles: [...this.customRoles.keys()] };
  }
}
