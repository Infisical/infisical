import { z } from "zod";

import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { AlertTriggerType, IResourceAlertProvider } from "./alert-types";

const baseProvider = (overrides: Partial<IResourceAlertProvider>): IResourceAlertProvider =>
  ({
    resourceType: "test.resource",
    events: [],
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

    expect(() => registry.register(baseProvider({}))).toThrow("already registered");
  });

  // Both guards fail boot in routes/index.ts rather than letting a dispatch silently no-op in prod.
  test("rejects a scheduled event with no findScheduledTargets", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({
          events: [{ key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled, conditionSchema: z.any() }]
        })
      )
    ).toThrow("does not implement findScheduledTargets");
  });

  test("rejects an event-triggered event with no findEventTargets", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({
          events: [{ key: "test.resource.opened", triggerType: AlertTriggerType.Event, conditionSchema: z.any() }]
        })
      )
    ).toThrow("does not implement findEventTargets");
  });

  test("accepts a provider that implements the method each of its events needs", () => {
    const registry = alertProviderRegistryFactory();

    expect(() =>
      registry.register(
        baseProvider({
          events: [
            { key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled, conditionSchema: z.any() },
            { key: "test.resource.opened", triggerType: AlertTriggerType.Event, conditionSchema: z.any() }
          ],
          findScheduledTargets: async () => [],
          findEventTargets: async () => []
        })
      )
    ).not.toThrow();
  });

  test("reports only the event-triggered keys, so the event consumer ignores scheduled ones", () => {
    const registry = alertProviderRegistryFactory();
    registry.register(
      baseProvider({
        events: [
          { key: "test.resource.expiry", triggerType: AlertTriggerType.Scheduled, conditionSchema: z.any() },
          { key: "test.resource.opened", triggerType: AlertTriggerType.Event, conditionSchema: z.any() }
        ],
        findScheduledTargets: async () => [],
        findEventTargets: async () => []
      })
    );

    expect([...registry.eventTriggeredKeys()]).toEqual(["test.resource.opened"]);
  });
});
