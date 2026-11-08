import { Meter } from "../model/meter";

// What License needs to know about organizations. The organizations domain registers it, so License depends
// on no product.
export type TLicenseOrganizations = {
  // The org's root: itself for a root org, the root a sub-org belongs to. Null when the org does not exist.
  // The License Server knows only root orgs.
  findRootOrgId: (orgId: string) => Promise<string | null>;
  // The projects that count against a plan's workspace limit, shown on the plan as workspacesUsed.
  countWorkspacesUsed: (rootOrgId: string) => Promise<number>;
  // Seats in use, from one count: org members, and members plus machine identities. A null orgId counts the
  // whole instance.
  countSeats: (orgId: string | null) => Promise<{ membersUsed: number; identitiesUsed: number }>;
};

// A meter's live count, registered by the domain that owns the data it counts.
export type TUsageCounter = {
  meter: Meter;
  // A null orgId counts the whole instance: a self-hosted license covers every org in the database.
  count(orgId: string | null): Promise<number>;
};
