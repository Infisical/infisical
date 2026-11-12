import { EventModificationType } from "@app/services/event-outbox/event-definition";
import { EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";

import { LICENSE_ORG_DELETED_CONSUMER, licenseOrgDeletedConsumerFactory } from "./license-org-deleted-consumer";
import { OrganizationModifiedEventV1 } from "./org-events";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const ROOT_ORG_ID = "00000000-0000-4000-8000-000000000002";
const EVENT_ID = "00000000-0000-4000-8000-000000009000";

const makeEvent = (data: Record<string, unknown>, isFinalAttempt = false): TEvent => ({
  specversion: "1.0",
  id: EVENT_ID,
  source: "urn:infisical:organization",
  type: OrganizationModifiedEventV1.type,
  time: new Date().toISOString(),
  data,
  isFinalAttempt
});

const orgDeleted = (rootOrgId: string | null = null) =>
  makeEvent({ organizationId: ORG_ID, rootOrgId, modificationType: EventModificationType.Deleted });

const build = (opts?: { isCloud?: boolean; deleteError?: Error }) => {
  const licenseClient = {
    deleteOrganization: vi.fn(async () => {
      if (opts?.deleteError) throw opts.deleteError;
      return { licensesClosed: 1, canceledSubscriptionIds: ["sub_1"], commitmentForfeited: false };
    }),
    invalidateEntitlements: vi.fn(async () => {})
  };
  const consumer = licenseOrgDeletedConsumerFactory({
    envConfig: { isCloud: opts?.isCloud ?? true },
    licenseClient
  });
  return { consumer, licenseClient };
};

describe("licenseOrgDeletedConsumerFactory", () => {
  test("subscribes to organization modifications only on cloud", () => {
    expect(build().consumer.subscribesTo(OrganizationModifiedEventV1.type)).toBe(true);
    expect(build({ isCloud: false }).consumer.subscribesTo(OrganizationModifiedEventV1.type)).toBe(false);
    expect(build().consumer.subscribesTo("com.infisical.organization.membership.removed.v1")).toBe(false);
    expect(build().consumer.name).toBe(LICENSE_ORG_DELETED_CONSUMER);
  });

  test("closes the root organization at the license server and drops its cached entitlements", async () => {
    const { consumer, licenseClient } = build();

    const results = await consumer.handle([orgDeleted()]);

    expect(results).toEqual([{ id: EVENT_ID, status: EventResultStatus.Delivered }]);
    expect(licenseClient.deleteOrganization).toHaveBeenCalledWith(ORG_ID);
    expect(licenseClient.invalidateEntitlements).toHaveBeenCalledWith(ORG_ID);
  });

  test("leaves a sub-organization alone, since it bills through its root", async () => {
    const { consumer, licenseClient } = build();

    const results = await consumer.handle([orgDeleted(ROOT_ORG_ID)]);

    expect(results).toEqual([{ id: EVENT_ID, status: EventResultStatus.Delivered }]);
    expect(licenseClient.deleteOrganization).not.toHaveBeenCalled();
  });

  test("ignores modifications that are not a deletion", async () => {
    const { consumer, licenseClient } = build();

    const results = await consumer.handle([
      makeEvent({ organizationId: ORG_ID, rootOrgId: null, modificationType: EventModificationType.Updated })
    ]);

    expect(results).toEqual([{ id: EVENT_ID, status: EventResultStatus.Delivered }]);
    expect(licenseClient.deleteOrganization).not.toHaveBeenCalled();
  });

  test("retries when the license server cannot be reached, on the last attempt too", async () => {
    const { consumer, licenseClient } = build({ deleteError: new Error("connect ECONNREFUSED") });

    const results = await consumer.handle(
      [orgDeleted(), orgDeleted()].map((e, i) => ({ ...e, isFinalAttempt: i === 1 }))
    );

    expect(results.map((r) => r.status)).toEqual([EventResultStatus.Retry, EventResultStatus.Retry]);
    expect(results[0].error).toContain("ECONNREFUSED");
    expect(licenseClient.invalidateEntitlements).not.toHaveBeenCalled();
  });

  test("fails an unreadable payload instead of retrying it", async () => {
    const { consumer, licenseClient } = build();

    const results = await consumer.handle([makeEvent({ organizationId: "not-a-uuid" })]);

    expect(results[0].status).toBe(EventResultStatus.Failed);
    expect(licenseClient.deleteOrganization).not.toHaveBeenCalled();
  });
});
