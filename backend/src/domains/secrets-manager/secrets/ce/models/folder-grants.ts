import { RuleSet } from "@app/domains/platform/access-control/ce/module";
import { TProjectPermissionAuditSource, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { FolderGrant } from "./folder-grant";

// The folder grants in force for one actor, layered over its project roles.
export class FolderGrants {
  private constructor(private readonly grants: FolderGrant[]) {}

  // The grants active at `now`: a temporary grant stops applying the moment it ends.
  static inForce(grants: FolderGrant[], now: Date = new Date()): FolderGrants {
    return new FolderGrants(grants.filter((grant) => grant.isActive(now)));
  }

  // The grants as given, active or not.
  static of(grants: FolderGrant[]): FolderGrants {
    return new FolderGrants([...grants]);
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

  // Each grant with the rules it contributes, in the order they apply: the grants that apply to subfolders,
  // shallowest first, then the exact ones, each grant's denies right before its own allows. So the deepest recursive
  // grant above a folder decides it, and an exact grant overrides every recursive grant at its own folder only.
  // Grouping every deny ahead of every allow would let a shallow grant's allows override a deeper grant's denies. An
  // exact grant keeps the recursive tables' folder create and edit only when the nearest recursive grant above it
  // gives them.
  rulesByGrant(): { grant: FolderGrant; rules: RuleSet<TProjectRule> }[] {
    const recursive = this.grants.filter((grant) => grant.appliesToSubfolders).sort((a, b) => a.depth - b.depth);
    const exact = this.grants.filter((grant) => !grant.appliesToSubfolders);

    const recursiveByFolder = new Map(
      recursive.map((grant) => [`${grant.environmentSlug}:${grant.folderPath}`, grant])
    );
    const usesRecursiveTables = (grant: FolderGrant) => {
      if (grant.appliesToSubfolders) return true;
      const segments = grant.folderPath.split("/").filter(Boolean);
      for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
        const deciding = recursiveByFolder.get(`${grant.environmentSlug}:/${segments.slice(0, depth).join("/")}`);
        if (deciding) return deciding.editsFolders;
      }
      return false;
    };

    return [...recursive, ...exact].map((grant) => ({
      grant,
      rules: grant.rules({ recursiveTables: usesRecursiveTables(grant) })
    }));
  }

  rules(): RuleSet<TProjectRule> {
    return RuleSet.of(this.rulesByGrant().flatMap(({ rules }) => rules.rules));
  }

  // Each grant as a permission audit source, in the order held, with the rules it contributes beside the others.
  auditSources(): TProjectPermissionAuditSource[] {
    const rulesById = new Map(this.rulesByGrant().map(({ grant, rules }) => [grant.id, rules]));
    return this.grants.map((grant) => grant.toAuditSource(rulesById.get(grant.id)));
  }
}
