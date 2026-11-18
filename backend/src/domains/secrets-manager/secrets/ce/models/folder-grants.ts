import { RuleSet } from "@app/domains/platform/access-control/ce/module";
import { TProjectRule } from "@app/domains/platform/projects/ce/module";
import { logger } from "@app/lib/logger";

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

  // The grants that apply to subfolders, then the exact ones; within each, every grant's deny block before every
  // grant's allow block. Each grant resets what is allowed at its folders, the exact grant on a subfolder overrides a
  // root grant at that folder only, and putting all denies first keeps one grant from undoing another's allow. An
  // exact grant uses the recursive role tables when a recursive grant in its environment already lets the holder
  // create and edit folders, so a higher exact role on a subfolder never takes that away.
  rules(): RuleSet<TProjectRule> {
    this.grants
      .filter((grant) => grant.isIgnored)
      .forEach((grant) =>
        logger.warn(
          `FolderGrants: ignoring a folder access grant that applies to subfolders outside the root folder [grantId=${grant.id}] [environment=${grant.environmentSlug}] [secretPath=${grant.secretPath}]`
        )
      );
    const folderEditingEnvironments = new Set(
      this.grants.filter((grant) => grant.editsFoldersAcrossEnvironment).map((grant) => grant.environmentSlug)
    );
    const blocks = (grants: FolderGrant[]) => {
      const options = (grant: FolderGrant) => ({
        recursiveTables: grant.appliesToSubfolders || folderEditingEnvironments.has(grant.environmentSlug)
      });
      return [
        ...grants.flatMap((grant) => grant.denyBlock(options(grant)).rules),
        ...grants.flatMap((grant) => grant.allowBlock(options(grant)).rules)
      ];
    };
    return RuleSet.of([
      ...blocks(this.grants.filter((grant) => grant.appliesToSubfolders)),
      ...blocks(this.grants.filter((grant) => !grant.appliesToSubfolders))
    ]);
  }
}
