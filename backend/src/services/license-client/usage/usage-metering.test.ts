import { beforeEach, describe, expect, test, vi } from "vitest";

import { QueueJobs, QueueName } from "@app/queue";

import { featureReaderFactory } from "../feature-reader";
import { MaxActiveCerts, MaxIdentities, MaxInternalCas, MaxPamResources, SecretIdentities } from "../features";
import { buildMeteredFeatures } from "./usage-counters";
import { usageEventQueueFactory } from "./usage-event-queue";
import { usageMeteringServiceFactory } from "./usage-metering-service";
import { buildUsageReporter, TUsageSnapshot } from "./usage-reporter";

type TQueueCall = [QueueName, QueueJobs, { orgId: string; dimensionKey: string }, { jobId: string; delay?: number }];

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";

const flushAsync = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const makeQueueMock = () => vi.fn(async () => {});

const createFakeKeyStore = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItemWithExpiry: vi.fn(async (key: string, _ttl: number | string, value: string | number | Buffer) => {
      store.set(key, String(value));
      return "OK" as const;
    }),
    store
  };
};

describe("usageMeteringService.emit (org-scoped)", () => {
  test("does nothing when the v2 license server is disabled", async () => {
    const queue = makeQueueMock();
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById: vi.fn() },
      envConfig: { LICENSE_SERVER_V2_MODE: "off" }
    });

    svc.emit(ORG_ID, MaxIdentities.key);
    await flushAsync();

    expect(queue).not.toHaveBeenCalled();
  });

  test("enqueues a debounced, deduplicated job when enabled", async () => {
    const queue = makeQueueMock();
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById: vi.fn() },
      envConfig: { LICENSE_SERVER_V2_MODE: "read-compare" }
    });

    svc.emit(ORG_ID, MaxIdentities.key);
    await flushAsync();

    expect(queue).toHaveBeenCalledTimes(1);
    const [name, job, data, opts] = queue.mock.calls[0] as unknown as TQueueCall;
    expect(name).toBe(QueueName.UsageEvent);
    expect(job).toBe(QueueJobs.UsageEvent);
    expect(data).toEqual({ orgId: ORG_ID, dimensionKey: MaxIdentities.key });
    expect(opts.jobId).toBe(`usage-event:${ORG_ID}:${MaxIdentities.key}`);
    expect(opts.delay).toBe(60_000);
  });

  test("never throws into the caller when enqueue fails", async () => {
    const queue = vi.fn(async () => {
      throw new Error("redis down");
    });
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById: vi.fn() },
      envConfig: { LICENSE_SERVER_V2_MODE: "read-compare" }
    });

    expect(() => svc.emit(ORG_ID, MaxIdentities.key)).not.toThrow();
    await flushAsync();
  });
});

describe("usageMeteringService.emitForProject (project-scoped)", () => {
  test("resolves the org from the project and enqueues an org-keyed job", async () => {
    const queue = makeQueueMock();
    const findById = vi.fn(async () => ({ id: PROJECT_ID, orgId: ORG_ID }));
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById } as never,
      envConfig: { LICENSE_SERVER_V2_MODE: "read-compare" }
    });

    svc.emitForProject(PROJECT_ID, MaxPamResources.key);
    await flushAsync();

    expect(findById).toHaveBeenCalledWith(PROJECT_ID);
    expect(queue).toHaveBeenCalledTimes(1);
    const [, , data, opts] = queue.mock.calls[0] as unknown as TQueueCall;
    expect(data).toEqual({ orgId: ORG_ID, dimensionKey: MaxPamResources.key });
    expect(opts.jobId).toBe(`usage-event:${ORG_ID}:${MaxPamResources.key}`);
  });

  test("does not enqueue when the project is missing (e.g. soft-deleted)", async () => {
    const queue = makeQueueMock();
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById: vi.fn(async () => undefined) } as never,
      envConfig: { LICENSE_SERVER_V2_MODE: "read-compare" }
    });

    svc.emitForProject(PROJECT_ID, MaxPamResources.key);
    await flushAsync();

    expect(queue).not.toHaveBeenCalled();
  });

  test("does nothing when disabled", async () => {
    const queue = makeQueueMock();
    const findById = vi.fn();
    const svc = usageMeteringServiceFactory({
      queueService: { queue },
      projectDAL: { findById },
      envConfig: { LICENSE_SERVER_V2_MODE: "off" }
    });

    svc.emitForProject(PROJECT_ID, MaxPamResources.key);
    await flushAsync();

    expect(findById).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
});

describe("buildUsageReporter", () => {
  test("is null when disabled", () => {
    expect(buildUsageReporter({ LICENSE_SERVER_V2_MODE: "off" })).toBeNull();
  });

  test("is null when enabled but unconfigured", () => {
    expect(buildUsageReporter({ LICENSE_SERVER_V2_MODE: "read-compare" })).toBeNull();
  });

  test("is a reporter when enabled and configured", () => {
    const reporter = buildUsageReporter({
      LICENSE_SERVER_V2_MODE: "read-compare",
      LICENSE_SERVER_V2_URL: "https://license.example.com",
      LICENSE_SERVER_V2_SERVICE_KEY: "svc-key"
    });
    expect(reporter).not.toBeNull();
    expect(typeof reporter?.reportSnapshots).toBe("function");
  });
});

describe("buildMeteredFeatures", () => {
  test("wires all meters to their count fns", async () => {
    const licenseDAL = { countOrgUsersAndIdentities: vi.fn(async () => 7) };
    const usageCounterDAL = {
      countInternalCas: vi.fn(async () => 1),
      countActiveCerts: vi.fn(async () => 2),
      countPamResources: vi.fn(async () => 3),
      countSecretManagementIdentities: vi.fn(async () => 4)
    };
    const metered = buildMeteredFeatures({ licenseDAL, usageCounterDAL, isCloud: true });

    const byKey = Object.fromEntries(metered.map((m) => [m.feature.key, m.count]));
    expect(Object.keys(byKey).sort()).toEqual(
      [MaxIdentities.key, MaxInternalCas.key, MaxActiveCerts.key, MaxPamResources.key, SecretIdentities.key].sort()
    );

    expect(await byKey[MaxIdentities.key](ORG_ID)).toBe(7);
    expect(await byKey[MaxInternalCas.key](ORG_ID)).toBe(1);
    expect(await byKey[MaxActiveCerts.key](ORG_ID)).toBe(2);
    expect(await byKey[MaxPamResources.key](ORG_ID)).toBe(3);
    expect(await byKey[SecretIdentities.key](ORG_ID)).toBe(4);
    expect(licenseDAL.countOrgUsersAndIdentities).toHaveBeenCalledWith(ORG_ID);
    // Cloud scopes the secret-identity meter to the org.
    expect(usageCounterDAL.countSecretManagementIdentities).toHaveBeenCalledWith(ORG_ID);
  });

  test("self-hosted meters secret identities across the whole instance (no org scope)", async () => {
    const licenseDAL = { countOrgUsersAndIdentities: vi.fn(async () => 0) };
    const usageCounterDAL = {
      countInternalCas: vi.fn(async () => 0),
      countActiveCerts: vi.fn(async () => 0),
      countPamResources: vi.fn(async () => 0),
      countSecretManagementIdentities: vi.fn(async () => 9)
    };
    const metered = buildMeteredFeatures({ licenseDAL, usageCounterDAL, isCloud: false });
    const secret = metered.find((m) => m.feature.key === SecretIdentities.key);

    expect(await secret?.count(ORG_ID)).toBe(9);
    expect(usageCounterDAL.countSecretManagementIdentities).toHaveBeenCalledWith(undefined);
  });
});

describe("usageEventQueue.handleUsageEvent (worker)", () => {
  const meteredFeatures = [{ feature: MaxIdentities, count: vi.fn(async () => 42) }];

  const buildQueue = (
    overrides: { usageReporter?: unknown; keyStore?: ReturnType<typeof createFakeKeyStore>; orgFind?: unknown } = {}
  ) => {
    const reportSnapshots = vi.fn(async () => {});
    const keyStore = overrides.keyStore ?? createFakeKeyStore();
    const usageReporter = overrides.usageReporter === undefined ? { reportSnapshots } : overrides.usageReporter;
    const emit = vi.fn();
    const find = overrides.orgFind ?? vi.fn(async () => []);
    const queue = usageEventQueueFactory({
      queueService: { start: vi.fn() },
      cronJob: { register: vi.fn(), start: vi.fn(), stop: vi.fn() } as never,
      keyStore,
      orgDAL: { find } as never,
      usageMeteringService: { emit },
      meteredFeatures,
      usageReporter: usageReporter as never,
      source: "test-region"
    });
    return { queue, reportSnapshots, keyStore, emit, find };
  };

  beforeEach(() => {
    meteredFeatures[0].count.mockClear();
  });

  test("no-ops when the reporter is null (v2 disabled)", async () => {
    const { queue } = buildQueue({ usageReporter: null });
    await queue.handleUsageEvent(ORG_ID, MaxIdentities.key, new Date());
    expect(meteredFeatures[0].count).not.toHaveBeenCalled();
  });

  test("reports a snapshot and records the value on first observation", async () => {
    const { queue, reportSnapshots, keyStore } = buildQueue();
    await queue.handleUsageEvent(ORG_ID, MaxIdentities.key, new Date());

    expect(reportSnapshots).toHaveBeenCalledTimes(1);
    const [orgId, snapshots] = reportSnapshots.mock.calls[0] as unknown as [string, TUsageSnapshot[]];
    expect(orgId).toBe(ORG_ID);
    expect(snapshots[0]).toMatchObject({
      dimension_key: MaxIdentities.key,
      value: 42,
      source: "test-region"
    });
    expect(keyStore.store.get(`license-usage-last-reported-${ORG_ID}-${MaxIdentities.key}`)).toBe("42");
  });

  test("skips the report when the count is unchanged", async () => {
    const keyStore = createFakeKeyStore();
    keyStore.store.set(`license-usage-last-reported-${ORG_ID}-${MaxIdentities.key}`, "42");
    const { queue, reportSnapshots } = buildQueue({ keyStore });

    await queue.handleUsageEvent(ORG_ID, MaxIdentities.key, new Date());
    expect(reportSnapshots).not.toHaveBeenCalled();
  });

  test("drops events for unknown features", async () => {
    const { queue, reportSnapshots } = buildQueue();
    await queue.handleUsageEvent(ORG_ID, "not_a_meter", new Date());
    expect(reportSnapshots).not.toHaveBeenCalled();
  });

  test("flushAllOrgs pages through orgs and emits per meter", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ({ id: `org-${i}` }));
    const lastPage = [{ id: "org-500" }];
    const orgFind = vi.fn().mockResolvedValueOnce(fullPage).mockResolvedValueOnce(lastPage);
    const { queue, emit } = buildQueue({ orgFind });

    await queue.flushAllOrgs();

    expect(orgFind).toHaveBeenCalledTimes(2); // stops after the partial page
    expect(orgFind).toHaveBeenNthCalledWith(1, {}, { limit: 500, offset: 0 });
    expect(orgFind).toHaveBeenNthCalledWith(2, {}, { limit: 500, offset: 500 });
    expect(emit).toHaveBeenCalledTimes(501); // 501 orgs x 1 metered feature
  });

  test("flushAllOrgs no-ops when the reporter is null", async () => {
    const { queue, emit, find } = buildQueue({ usageReporter: null });
    await queue.flushAllOrgs();
    expect(find).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

// Demonstrates how a metered create path would gate on the new framework once enforcement is wired
// (PLATFOR-449/418): register the live-count fns with the SDK (as routes/index.ts does at boot),
// then read the feature and call canUse() before allowing the action. No production call site does
// this yet — these tests document the intended pattern.
describe("canUse enforcement (using the framework from a call site)", () => {
  const buildReader = (
    caps: Record<string, { value: number }>,
    counts: { identities?: number; internalCas?: number }
  ) => {
    const reader = featureReaderFactory({ getEntitlements: async () => ({ features: caps, products: [] }) });
    const licenseDAL = { countOrgUsersAndIdentities: async () => counts.identities ?? 0 };
    const usageCounterDAL = {
      countInternalCas: async () => counts.internalCas ?? 0,
      countActiveCerts: async () => 0,
      countPamResources: async () => 0,
      countSecretManagementIdentities: async () => 0
    };
    buildMeteredFeatures({ licenseDAL, usageCounterDAL, isCloud: true }).forEach(({ feature, count }) =>
      reader.registerCounter(feature, count)
    );
    return reader;
  };

  test("canUse() compares the live count against the cap resolved from entitlements", async () => {
    const reader = buildReader({ max_identities: { value: 100 } }, { identities: 99 });

    const identities = await reader.getFeature(ORG_ID, MaxIdentities);
    expect(identities.value).toBe(100); // cap comes from the License Server entitlement
    expect(await identities.canUse(1)).toBe(true); // 99 + 1 <= 100
    expect(await identities.canUse(2)).toBe(false); // 99 + 2 > 100
  });

  test("a metered create path blocks once the cap is reached", async () => {
    const reader = buildReader({ max_internal_cas: { value: 1 } }, { internalCas: 1 });

    const assertCanCreateInternalCa = async () => {
      const cas = await reader.getFeature(ORG_ID, MaxInternalCas);
      if (!(await cas.canUse(1))) {
        throw new Error(`max_internal_cas limit reached (cap ${cas.value})`);
      }
    };

    await expect(assertCanCreateInternalCa()).rejects.toThrow("max_internal_cas limit reached (cap 1)");
  });
});
