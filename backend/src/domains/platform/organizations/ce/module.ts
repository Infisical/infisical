import type { TActorOrg } from "@app/domains/lib/actor-context";
import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { OrganizationDataAccess } from "./data-access/organization-data-access";

export * from "./service/permission/org-permission";

export type TOrganizationsDomain = {
  // The org facts every request acting in it carries (req.permission.org). Undefined when the org does not exist.
  findActorOrg: (input: { orgId: string }) => Promise<TActorOrg | undefined>;
  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  findRootOrgId: (orgId: string) => Promise<string | null>;
  // The org's root, or the org itself when it does not exist.
  resolveRootOrgId: (orgId: string) => Promise<string>;
};

export type TOrganizationsDeps = {
  db: DataAccessDb;
};

// The top-level container: orgs and sub-orgs, and what every request acting in an org needs to know about it.
export class OrganizationsModule {
  readonly name = "organizations";

  readonly service: TOrganizationsDomain;

  constructor({ db }: TOrganizationsDeps) {
    const organizations = new OrganizationDataAccess(db);
    this.service = {
      findActorOrg: async ({ orgId }) => {
        const organization = await organizations.findActorOrganization(orgId);
        return organization?.toActorOrg();
      },
      findRootOrgId: (orgId) => organizations.findRootOrgId(orgId),
      resolveRootOrgId: (orgId) => organizations.resolveRootOrgId(orgId)
    };
  }
}
