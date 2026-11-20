import { describe, expect, test } from "vitest";

import { matchTransformationRows } from "./agent-vault-transformation-fns";

const row = (id: string, name: string) => ({ id, name, encryptedValue: Buffer.from(id) });

const match = (existing: ReturnType<typeof row>[], incoming: { id?: string; name: string }[]) =>
  matchTransformationRows({
    existing,
    incoming: incoming.map((header) => ({ id: header.id, naturalKey: header.name.toLowerCase() })),
    naturalKeyOfRow: (stored) => stored.name.toLowerCase(),
    subject: "custom header"
  });

describe("matchTransformationRows", () => {
  test("matches by id first, then by natural key", () => {
    const existing = [row("a", "X-Tenant"), row("b", "X-Region")];
    expect(match(existing, [{ name: "x-region" }, { id: "a", name: "X-Renamed" }])).toEqual([existing[1], existing[0]]);
  });

  test("a row claimed by id can't also be claimed by name", () => {
    const existing = [row("a", "X-Tenant")];
    expect(match(existing, [{ id: "a", name: "X-Renamed" }, { name: "X-Tenant" }])).toEqual([existing[0], undefined]);
  });

  test("refuses an unknown id rather than falling back to the name", () => {
    expect(() => match([row("a", "X-Tenant")], [{ id: "missing", name: "X-Tenant" }])).toThrow(
      "No custom header with ID 'missing' belongs to this service"
    );
  });

  test("refuses an id listed twice", () => {
    expect(() =>
      match(
        [row("a", "X-Tenant")],
        [
          { id: "a", name: "X-One" },
          { id: "a", name: "X-Two" }
        ]
      )
    ).toThrow("The custom header with ID 'a' is listed twice");
  });
});
