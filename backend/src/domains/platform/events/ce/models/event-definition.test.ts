import { z } from "zod";

import { EmittedEvent } from "./emitted-event";
import { EventDefinition } from "./event-definition";

const ExampleEvent = EventDefinition.define({
  domain: "secrets",
  entity: "secret-import",
  action: "modified",
  version: 2,
  data: z.object({ secretImportId: z.string() })
});

describe("EventDefinition.define", () => {
  test.each([
    ["domain", { domain: "Secrets" }],
    ["entity", { entity: "secret_import" }],
    ["action", { action: "modified.again" }],
    ["entity", { entity: "" }]
  ])("should refuse a %s that is not lower-kebab-case", (_, override) => {
    // Setup
    const record = { domain: "secrets", entity: "secret", action: "modified", version: 1, data: z.object({}) };

    // Action
    const define = () => EventDefinition.define({ ...record, ...override });

    // Assert
    expect(define).toThrow("must be lower-kebab-case");
  });

  test.each([0, -1, 1.5])("should refuse version %s", (version) => {
    // Action
    const define = () =>
      EventDefinition.define({ domain: "secrets", entity: "secret", action: "modified", version, data: z.object({}) });

    // Assert
    expect(define).toThrow("must be a positive integer");
  });
});

describe("EventDefinition.build", () => {
  // A definition must never build an event that emit refuses.
  test("should name the event by the ADR convention and build an input that can be emitted", () => {
    // Action
    const input = ExampleEvent.build({ secretImportId: "import-1" });

    // Assert
    expect(input).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/) as string,
      type: "com.infisical.secrets.secret-import.modified.v2",
      data: { secretImportId: "import-1" }
    });
    expect(EmittedEvent.create(input).type).toBe(ExampleEvent.type);
  });

  test("should give every built event its own id", () => {
    // Action
    const [first, second] = [ExampleEvent.build({ secretImportId: "a" }), ExampleEvent.build({ secretImportId: "a" })];

    // Assert
    expect(first.id).not.toBe(second.id);
  });
});

describe("EventDefinition.sourceOf", () => {
  test("should be the domain of an event named by the ADR convention", () => {
    expect(EventDefinition.sourceOf(ExampleEvent.type)).toBe("urn:infisical:secrets");
  });

  test("should be the first segment of an event named before the ADR", () => {
    expect(EventDefinition.sourceOf("identity.authentication.auth-method-changed")).toBe("urn:infisical:identity");
  });
});
