import { AbilityTuple } from "@casl/ability";

import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { TResourceRoles } from "@app/domains/platform/projects/ce/module";

// Reaching a bundle is a filter the services apply, not a CASL rule, so a consumer carries no rules and a project
// admin gets nothing on a bundle it is not granted. Any other slug fails loudly rather than granting nothing.
export class AccessBundleRoles implements TResourceRoles<AbilityTuple> {
  readonly resourceType = ResourceType.AgentVaultAccessBundle;

  // The one role an access bundle membership holds (AgentVaultResourceRole in ee/services/agent-vault).
  private readonly consumerRole = "consumer";

  private readonly noRules: TPermissionRule<AbilityTuple>[] = [];

  rulesFor(grant: Grant): TPermissionRule<AbilityTuple>[] {
    const slug = grant.builtInSlug() ?? grant.toJSON().slug;
    if (slug === this.consumerRole) return this.noRules;
    throw new EntityNotFoundError({ name: "AgentVaultRoleInvalid", message: `Agent Vault role '${slug}' not found` });
  }

  projectAdminRules(): TPermissionRule<AbilityTuple>[] {
    return this.noRules;
  }
}
