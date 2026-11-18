import { RuleSet } from "@app/domains/platform/access-control/ce/module";
import { TProjectRule } from "@app/domains/platform/projects/ce/module";

import { FolderGrant } from "./folder-grant";

// The folder grants in force for one actor, layered over its project roles.
export class FolderGrants {
  private constructor(private readonly grants: FolderGrant[]) {}

  // The grants active at `now`: a temporary grant stops applying the moment it ends.
  static inForce(grants: FolderGrant[], now: Date = new Date()): FolderGrants {
    return new FolderGrants(grants.filter((grant) => grant.isActive(now)));
  }

  static none(): FolderGrants {
    return new FolderGrants([]);
  }

  get list(): FolderGrant[] {
    return [...this.grants];
  }

  get isEmpty(): boolean {
    return this.grants.length === 0;
  }

  // Every grant's deny block, then every grant's allow block: each grant resets what is allowed at its folder, and
  // putting all denies first keeps one grant from undoing another's allow at the same folder.
  rules(): RuleSet<TProjectRule> {
    const denies = this.grants.flatMap((grant) => grant.denyBlock().rules);
    const allows = this.grants.flatMap((grant) => grant.allowBlock().rules);
    return RuleSet.of([...denies, ...allows]);
  }
}
