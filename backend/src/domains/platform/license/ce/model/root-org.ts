// The org the License Server knows: a root org, or the root a sub-org belongs to.
export type TRootOrg = { id: string; name: string; slug: string };

// What the License domain needs to know about organizations. The organizations domain registers it, so
// License depends on no product.
export type TLicenseOrganizations = {
  // A root org, or the root a sub-org belongs to. Null when the org does not exist.
  findRootOrg: (orgId: string) => Promise<TRootOrg | null>;
  // The projects that count against a plan's workspace limit, shown on the plan as workspacesUsed.
  countWorkspacesUsed: (rootOrgId: string) => Promise<number>;
};
