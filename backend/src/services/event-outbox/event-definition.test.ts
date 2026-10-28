import { z } from "zod";

import { defineEvent, eventSource } from "./event-definition";
import { EventInputSchema, TEventInput } from "./event-outbox-types";

const ExampleEvent = defineEvent({
  domain: "secrets",
  entity: "secret-import",
  action: "modified",
  version: 2,
  data: z.object({ secretImportId: z.string() })
});

describe("defineEvent", () => {
  // The outbox validates every emitted event; a definition must never produce one it rejects.
  test("names the event by the ADR convention and builds an input the outbox accepts", () => {
    const input = ExampleEvent.build({ secretImportId: "import-1" });

    expect(input).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/) as string,
      type: "com.infisical.secrets.secret-import.modified.v2",
      data: { secretImportId: "import-1" }
    });
    expect(EventInputSchema.safeParse(input).success).toBe(true);
    expect(ExampleEvent.build({ secretImportId: "import-1" }).id).not.toBe(input.id);
  });

  test("emits the built event through the emitter, inside the caller's tx", async () => {
    const calls: { events: TEventInput[]; tx: unknown }[] = [];
    const tx = { sentinel: true } as never;

    await ExampleEvent.emit(
      {
        emit: async (events, emitTx) => {
          calls.push({ events, tx: emitTx });
        }
      },
      { secretImportId: "import-1" },
      tx
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].tx).toBe(tx);
    expect(calls[0].events).toEqual([
      expect.objectContaining({ type: ExampleEvent.type, data: { secretImportId: "import-1" } })
    ]);
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

describe("eventSource", () => {
  test("is the domain of an event named by the ADR convention", () => {
    expect(eventSource(ExampleEvent.type)).toBe("urn:infisical:secrets");
  });

  test("is the first segment of an event named before the ADR", () => {
    expect(eventSource("identity.authentication.auth-method-changed")).toBe("urn:infisical:identity");
  });
});
