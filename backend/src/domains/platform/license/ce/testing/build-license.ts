import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { FakeOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/testing/fake-organizations-projects-service";
import { TQueueServiceFactory } from "@app/queue";

import { LicenseModule } from "../module";
import { TUsageCounter } from "../service/dependencies";
import { FakeLicenseServer } from "./fake-license-server";
import { FakeQueue } from "./fake-queue";

export const ROOT = { id: "11111111-1111-4111-8111-111111111111" };
export const SUB_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ROOT = { id: "33333333-3333-4333-8333-333333333333" };
export const WORKSPACES_USED = 3;

export type TBuildLicenseOptions = {
  licenseServer?: FakeLicenseServer;
  counters?: TUsageCounter[];
  // The key store's clock, for tests that let entries expire.
  now?: () => number;
  // Replaces methods of the organizations-projects fake below.
  organizations?: Partial<FakeOrganizationsProjectsService>;
};

// resolveRootOrgId reads findRootOrgId, so overriding one overrides both.
const buildOrganizations = (overrides: Partial<FakeOrganizationsProjectsService> = {}) => {
  const organizations = new FakeOrganizationsProjectsService()
    .setRoot(ROOT.id, ROOT.id)
    .setRoot(SUB_ORG_ID, ROOT.id)
    .setRoot(OTHER_ROOT.id, OTHER_ROOT.id);
  organizations.workspaces = WORKSPACES_USED;
  return Object.assign(organizations, overrides);
};

export const buildLicense = async ({
  licenseServer = new FakeLicenseServer(),
  counters = [],
  now,
  organizations
}: TBuildLicenseOptions = {}) => {
  const keyStore = new InMemoryKeyStore(now);
  const queue = new FakeQueue();
  const registeredCrons: string[] = [];
  const cronHandlers = new Map<string, () => Promise<void>>();
  const module = new LicenseModule({
    keyStore,
    queueService: queue as unknown as Pick<TQueueServiceFactory, "queue" | "start">,
    cronJob: {
      register: (job) => {
        registeredCrons.push(`${job.name}:${String(job.enabled)}`);
        cronHandlers.set(job.name, async () => {
          await job.handler();
        });
      }
    },
    isProductionMode: false,
    startLocalRefresh: () => ({ stop: () => undefined }) as never,
    provider: licenseServer,
    licenseServer,
    organizationsProjectsService: buildOrganizations(organizations),
    usageCounters: counters
  });
  await module.start();
  return {
    module,
    licenseService: module.service,
    usageMeteringService: module.usageMeteringService,
    licenseServer,
    keyStore,
    queue,
    registeredCrons,
    cronHandlers
  };
};
