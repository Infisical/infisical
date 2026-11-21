import { describe, expect, test } from "vitest";

import { withoutDeniedServices } from "./agent-vault-resolve-dal";

const row = (id: string, hostPattern: string) => ({ id, hostPattern });
const idsOf = (rows: { id: string }[]) => rows.map((entry) => entry.id);

describe("withoutDeniedServices", () => {
  test("leaves out a denied service and a wildcard that would take over its host, and keeps the rest", () => {
    const rows = [row("denied", "api.example.com"), row("wildcard", "*.example.com"), row("other", "api.other.org")];

    expect(idsOf(withoutDeniedServices(rows, (id) => id === "denied", []))).toEqual(["other"]);
  });

  test("keeps leaving out wildcards until none left can take over a host of one left out", () => {
    // Leaving out `narrow` for its `*.api.example.com` would hand `api.example.com`, which it limits, to `broad`.
    const rows = [
      row("broad", "*.example.com"),
      row("narrow", "api.example.com, *.api.example.com"),
      row("denied", "v1.api.example.com")
    ];

    expect(idsOf(withoutDeniedServices(rows, (id) => id === "denied", []))).toEqual([]);
  });

  test("keeps a wildcard the owner can use directly", () => {
    const rows = [row("broad", "*.example.com"), row("denied", "api.example.com")];

    expect(idsOf(withoutDeniedServices(rows, (id) => id === "denied", ["broad"]))).toEqual(["broad"]);
  });

  test("changes nothing when nothing is denied", () => {
    const rows = [row("broad", "*.example.com"), row("narrow", "api.example.com")];

    expect(withoutDeniedServices(rows, null, [])).toBe(rows);
    expect(idsOf(withoutDeniedServices(rows, () => false, []))).toEqual(["broad", "narrow"]);
  });
});
