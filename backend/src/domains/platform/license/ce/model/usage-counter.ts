import { TTransaction } from "@app/domains/lib/transaction-runner";

import { TMeteredFeature } from "./metered-features";

// "org-tree" counts a root org and its sub-orgs as one, reported at the root. "org" is reported at the org
// whose change triggered the report.
export type TUsageCounterScope = "org" | "org-tree";

// A metered dimension's count, owned by the domain whose data it counts.
export type TUsageCounter = {
  feature: TMeteredFeature;
  scope: TUsageCounterScope;
  // A null orgId counts the whole instance: a self-hosted license covers every org in the database.
  count(orgId: string | null, tx?: TTransaction): Promise<number>;
};
