import { Meter } from "../../models/meter";
import { FakeUsageCounter } from "../../testing/fake-usage-counter";
import { TUsageCounter } from "../dependencies";
import { CounterRegistry } from "./usage-counters";

describe("CounterRegistry", () => {
  test("should refuse a counter that can't break its count down", () => {
    // Setup
    const counter = { meter: Meter.SecretIdentities, count: async () => 0 } as unknown as TUsageCounter;

    // Action
    const build = () => new CounterRegistry([counter]);

    // Assert
    expect(build).toThrow("The usage counter for 'secret_identities' has no breakdown");
  });

  test("should refuse a counter for a meter recorded as events", () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.AgentVaultBrokeredRequests);

    // Action
    const build = () => new CounterRegistry([counter]);

    // Assert
    expect(build).toThrow("'agent_vault_brokered_requests' is recorded as events");
  });

  test("should refuse two counters for the same meter", () => {
    // Setup
    const counters = [new FakeUsageCounter(Meter.ActiveCerts), new FakeUsageCounter(Meter.ActiveCerts)];

    // Action
    const build = () => new CounterRegistry(counters);

    // Assert
    expect(build).toThrow("Two usage counters were given for 'active_certs'");
  });
});
