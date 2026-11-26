import { RuleSet } from "@app/domains/platform/access-control/ce/module";
import { TProjectPermissionAuditSource, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { FolderGrant } from "./folder-grant";

// One actor's folder grants, layered over its project roles.
export class FolderGrants {
  private constructor(private readonly grants: FolderGrant[]) {}

  static inForce(grants: FolderGrant[], now: Date = new Date()): FolderGrants {
    return new FolderGrants(grants.filter((grant) => grant.isActive(now)));
  }

  // Keeps inactive grants too.
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

  // Order matters: recursive grants shallowest first, then exact ones, each grant's denies right before its allows.
  // So the deepest recursive grant decides, and an exact grant wins at its own folder only. All denies first would let
  // a shallow grant's allows beat a deeper grant's denies. An exact grant gets folder create/edit only if the nearest
  // recursive grant above it gives it.
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

  // Listed in the order held, but each with the rules it contributes in rulesByGrant order.
  auditSources(): TProjectPermissionAuditSource[] {
    const rulesById = new Map(this.rulesByGrant().map(({ grant, rules }) => [grant.id, rules]));
    return this.grants.map((grant) => grant.toAuditSource(rulesById.get(grant.id)));
  }
}
