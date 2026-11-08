import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { TQueueServiceFactory } from "@app/queue";

import { TLicenseOrganizations, TRootOrg } from "../model/root-org";
import { TUsageCounter } from "../model/usage-counter";
import { LicenseModule } from "../module";
import { FakeLicenseHooks } from "./fake-license-hooks";
import { FakeQueue } from "./fake-queue";

export const ROOT: TRootOrg = { id: "11111111-1111-4111-8111-111111111111", name: "Acme", slug: "acme" };
export const SUB_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ROOT: TRootOrg = { id: "33333333-3333-4333-8333-333333333333", name: "Other", slug: "other" };
export const WORKSPACES_USED = 3;

export type TBuildLicenseOptions = {
  hooks?: FakeLicenseHooks;
  counters?: TUsageCounter[];
  // The key store's clock, for tests that let entries expire.
  now?: () => number;
};

// ROOT with SUB_ORG_ID under it, and OTHER_ROOT.
const organizations: TLicenseOrganizations = {
  findRootOrg: async (orgId) => ({ [ROOT.id]: ROOT, [SUB_ORG_ID]: ROOT, [OTHER_ROOT.id]: OTHER_ROOT })[orgId] ?? null,
  countWorkspacesUsed: async () => WORKSPACES_USED
};

// A started License module over an in-memory key store and queue, with the organizations above and the
// given counters registered.
export const buildLicense = async ({
  hooks = new FakeLicenseHooks(),
  counters = [],
  now
}: TBuildLicenseOptions = {}) => {
  const keyStore = new InMemoryKeyStore(now);
  const queue = new FakeQueue();
  const registeredCrons: string[] = [];
  const module = new LicenseModule({
    keyStore,
    queueService: queue as unknown as Pick<TQueueServiceFactory, "queue" | "start">,
    cronJob: { register: (job) => registeredCrons.push(`${job.name}:${String(job.enabled)}`) },
    isProductionMode: false,
    startLocalRefresh: () => ({ stop: () => undefined }) as never,
    hooks
  });
  module.registry.registerOrganizations(organizations);
  counters.forEach((counter) => module.registry.registerUsageCounter(counter));
  await module.start();
  return { module, licenseDomain: module.service, hooks, keyStore, queue, registeredCrons };
};
