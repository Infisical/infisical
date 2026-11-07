import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { TQueueServiceFactory } from "@app/queue";

import { TRootOrg } from "../model/root-org";
import { TUsageCounter } from "../model/usage-counter";
import { LicenseModule } from "../module";
import { FakeLicenseHooks } from "./fake-license-hooks";
import { FakeQueue } from "./fake-queue";

export const ROOT: TRootOrg = { id: "11111111-1111-4111-8111-111111111111", name: "Acme", slug: "acme" };
export const SUB_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ROOT: TRootOrg = { id: "33333333-3333-4333-8333-333333333333", name: "Other", slug: "other" };

// A License module over an in-memory key store and queue, with ROOT, a sub-org of it, and OTHER_ROOT.
export const buildLicense = async ({
  hooks = new FakeLicenseHooks(),
  counters = [] as TUsageCounter[],
  now
}: { hooks?: FakeLicenseHooks; counters?: TUsageCounter[]; now?: () => number } = {}) => {
  const keyStore = new InMemoryKeyStore(now);
  const queue = new FakeQueue();
  const roots: Record<string, TRootOrg> = { [ROOT.id]: ROOT, [SUB_ORG_ID]: ROOT, [OTHER_ROOT.id]: OTHER_ROOT };
  const registered: string[] = [];
  const module = new LicenseModule({
    keyStore,
    queueService: queue as unknown as Pick<TQueueServiceFactory, "queue" | "start">,
    cronJob: { register: (job) => registered.push(`${job.name}:${String(job.enabled)}`) },
    resolveRootOrg: async (orgId) => roots[orgId] ?? null,
    countBillableProjects: async () => 3,
    counters,
    isProductionMode: false,
    startLocalRefresh: () => ({ stop: () => undefined }) as never,
    hooks
  });
  await module.start();
  return { module, license: module.service, hooks, keyStore, queue, registered };
};
