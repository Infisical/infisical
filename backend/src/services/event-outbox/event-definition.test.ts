import { z } from "zod";

import { defineEvent, toCloudEvent } from "./event-definition";
import { EventInputSchema } from "./event-outbox-types";

const ExampleEvent = defineEvent({
  domain: "secrets",
  entity: "secret-import",
  action: "modified",
  version: 2,
  data: z.object({ secretImportId: z.string() })
});

describe("defineEvent", () => {
  test("names the event and its source by the ADR convention", () => {
    expect(ExampleEvent.type).toBe("com.infisical.secrets.secret-import.modified.v2");
    expect(ExampleEvent.source).toBe("urn:infisical:secrets");
  });

  // The outbox validates every emitted key; a definition must never produce one it drops.
  test("builds an input the outbox accepts", () => {
    const input = ExampleEvent.build({ secretImportId: "import-1" });

    expect(input).toEqual({
      eventType: "com.infisical.secrets.secret-import.modified.v2",
      payload: { secretImportId: "import-1" }
    });
    expect(EventInputSchema.safeParse(input).success).toBe(true);
  });

  test.each([
    ["domain", { domain: "Secrets" }],
    ["entity", { entity: "secret_import" }],
    ["action", { action: "modified.again" }],
    ["entity", { entity: "" }]
  ])("rejects a %s that is not lower-kebab-case", (_, override) => {
    expect(() =>
      defineEvent({
        domain: "secrets",
        entity: "secret",
        action: "modified",
        version: 1,
        data: z.object({}),
        ...override
      })
    ).toThrow("must be lower-kebab-case");
  });

  test.each([0, -1, 1.5])("rejects version %s", (version) => {
    expect(() =>
      defineEvent({ domain: "secrets", entity: "secret", action: "modified", version, data: z.object({}) })
    ).toThrow("must be a positive integer");
  });
});

describe("toCloudEvent", () => {
  const event = {
    id: 42,
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: ExampleEvent.type,
    payload: { secretImportId: "import-1" },
    occurredAt: new Date("2026-08-20T17:42:31.000Z")
  };

  test("maps the stored event onto the CloudEvents envelope", () => {
    expect(toCloudEvent(ExampleEvent, event)).toEqual({
      specversion: "1.0",
      id: "550e8400-e29b-41d4-a716-446655440000",
      source: "urn:infisical:secrets",
      type: "com.infisical.secrets.secret-import.modified.v2",
      time: "2026-08-20T17:42:31.000Z",
      data: { secretImportId: "import-1" }
    });
  });

  test("refuses an event recorded without an eventId", () => {
    expect(() => toCloudEvent(ExampleEvent, { ...event, eventId: null })).toThrow("without an eventId");
  });

  test("refuses an event of another type", () => {
    expect(() =>
      toCloudEvent(ExampleEvent, { ...event, eventType: "com.infisical.secrets.secret.modified.v1" })
    ).toThrow("cannot be read as");
  });
});
