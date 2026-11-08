import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { TQueueServiceFactory } from "@app/queue";

import { LicenseModule } from "../module";
import { TLicenseOrganizations, TUsageCounter } from "../service/registrations";
import { FakeLicenseHooks } from "./fake-license-hooks";
import { FakeQueue } from "./fake-queue";

export const ROOT = { id: "11111111-1111-4111-8111-111111111111" };
export const SUB_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ROOT = { id: "33333333-3333-4333-8333-333333333333" };
export const WORKSPACES_USED = 3;

export type TBuildLicenseOptions = {
  hooks?: FakeLicenseHooks;
  counters?: TUsageCounter[];
  // The key store's clock, for tests that let entries expire.
  now?: () => number;
  // Replaces parts of the organizations registration below.
  organizations?: Partial<TLicenseOrganizations>;
};

// ROOT with SUB_ORG_ID under it, and OTHER_ROOT, with no seats used.
const defaultOrganizations: TLicenseOrganizations = {
  findRootOrgId: async (orgId) =>
    ({ [ROOT.id]: ROOT.id, [SUB_ORG_ID]: ROOT.id, [OTHER_ROOT.id]: OTHER_ROOT.id })[orgId] ?? null,
  countWorkspacesUsed: async () => WORKSPACES_USED,
  countSeats: async () => ({ membersUsed: 0, identitiesUsed: 0 })
};

// A started License module over an in-memory key store and queue, with the organizations above and the
// given counters registered.
export const buildLicense = async ({
  hooks = new FakeLicenseHooks(),
  counters = [],
  now,
  organizations
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
  module.registry.registerOrganizations({ ...defaultOrganizations, ...organizations });
  counters.forEach((counter) => module.registry.registerUsageCounter(counter));
  await module.start();
  return { module, licenseDomain: module.service, hooks, keyStore, queue, registeredCrons };
};
