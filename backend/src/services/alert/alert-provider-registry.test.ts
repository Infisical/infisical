import { z } from "zod";

import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { AlertTriggerType, IResourceAlertProvider } from "./alert-types";

const baseProvider = (overrides: Partial<IResourceAlertProvider>): IResourceAlertProvider =>
  ({
    resourceType: "test.resource",
    events: [],
    conditionSchema: z.any(),
    targetId: (target: { id: string }) => target.id,
    buildViewUrl: async () => "https://app.infisical.com/x",
    buildPayload: () => ({}) as never,
    assertPermission: async () => undefined,
    assertResourceInScope: async () => undefined,
    ...overrides
  }) as IResourceAlertProvider;

describe("alert provider registry", () => {
  test("rejects a second provider for the same resource type", () => {
    const registry = alertProviderRegistryFactory();
    registry.register(baseProvider({}));

    expect(() => registry.register(baseProvider({}))).toThrow(/already registered/);
  });

  // Both guards fail the boot in routes/index.ts, rather than letting a dispatch silently no-op in
  // production.
  test("rejects a scheduled event with no findDueTargets", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({ events: [{ key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled }] })
      )
    ).toThrow(/does not implement findDueTargets/);
  });

  test("rejects an event-triggered event with no findTargetsByIds", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({ events: [{ key: "test.resource.opened", triggerType: AlertTriggerType.Event }] })
      )
    ).toThrow(/does not implement findTargetsByIds/);
  });

  test("accepts a provider that implements the method each of its events needs", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({
          events: [
            { key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled },
            { key: "test.resource.opened", triggerType: AlertTriggerType.Event }
          ],
          findDueTargets: async () => [],
          findTargetsByIds: async () => []
        })
      )
    ).not.toThrow();
  });

  test("reports only the event-triggered keys, so the outbox consumer ignores scheduled ones", () => {
    const registry = alertProviderRegistryFactory();
    registry.register(
      baseProvider({
        events: [
          { key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled },
          { key: "test.resource.opened", triggerType: AlertTriggerType.Event }
        ],
        findDueTargets: async () => [],
        findTargetsByIds: async () => []
      })
    );

    expect([...registry.eventTriggeredKeys()]).toEqual(["test.resource.opened"]);
  });
});
