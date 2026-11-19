import { z } from "zod";

import { TEventConsumer } from "../dependencies";
import { ConsumerRegistry } from "./consumer-registry";

const makeConsumer = (name: string, subscribesTo: (type: string) => boolean = () => true): TEventConsumer => ({
  name,
  dataSchema: z.object({}),
  subscribesTo,
  handle: async () => []
});

describe("ConsumerRegistry.register", () => {
  test("should refuse a second consumer under a name already taken", () => {
    // Setup
    const registry = new ConsumerRegistry();
    registry.register(makeConsumer("alert"));

    // Action
    const register = () => registry.register(makeConsumer("alert"));

    // Assert
    expect(register).toThrow("already registered under the name 'alert'");
  });

  // A late consumer would have missed every event emitted before it.
  test("should refuse a consumer once the registry is sealed", () => {
    // Setup
    const registry = new ConsumerRegistry();
    registry.seal();

    // Action
    const register = () => registry.register(makeConsumer("alert"));

    // Assert
    expect(register).toThrow("was registered after the events module started");
  });
});

describe("ConsumerRegistry.subscribersOf", () => {
  test("should name only the consumers that subscribe to the event type", () => {
    // Setup
    const registry = new ConsumerRegistry();
    registry.register(makeConsumer("alert", (type) => type === "a.b.c"));
    registry.register(makeConsumer("audit", () => false));

    // Action
    const subscribers = registry.subscribersOf("a.b.c");

    // Assert
    expect(subscribers.map((consumer) => consumer.name)).toEqual(["alert"]);
  });
});
