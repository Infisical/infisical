import { describe, expect, it } from "vitest";

import {
  isSameSessionMetadata,
  metadataRecordToRows,
  metadataRowsToRecord,
  SESSION_METADATA_MAX_KEYS,
  sessionMetadataRowsSchema
} from "./sessionMetadataSchema";

const issueMessages = (rows: { key: string; value: string }[]) => {
  const result = sessionMetadataRowsSchema.safeParse(rows);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("sessionMetadataRowsSchema", () => {
  it("accepts blank rows and ignores them", () => {
    expect(issueMessages([{ key: " ", value: "" }])).toEqual([]);
  });

  it("refuses keys that collide after trimming", () => {
    expect(
      issueMessages([
        { key: "runId", value: "1" },
        { key: "runId ", value: "2" }
      ])
    ).toEqual([
      "The metadata key 'runId' appears more than once. Each key can be used once per session."
    ]);
  });

  it("refuses a value without a key", () => {
    expect(issueMessages([{ key: "", value: "8812" }])).toEqual([
      "Enter a key, or remove this row."
    ]);
  });

  it("refuses invisible characters", () => {
    expect(issueMessages([{ key: "alice​", value: "x" }])).toHaveLength(1);
    expect(issueMessages([{ key: "user", value: "a\tb" }])).toHaveLength(1);
  });

  it("refuses more than the key limit", () => {
    const rows = Array.from({ length: SESSION_METADATA_MAX_KEYS + 1 }, (_, i) => ({
      key: `k${i}`,
      value: "v"
    }));
    expect(issueMessages(rows)).toHaveLength(1);
  });
});

describe("metadata conversion", () => {
  it("drops blank rows and trims", () => {
    expect(
      metadataRowsToRecord([
        { key: " runId ", value: " 8812 " },
        { key: "", value: "" }
      ])
    ).toEqual({ runId: "8812" });
  });

  it("round-trips a record", () => {
    const metadata = { runId: "8812", ticket: "AGE2-320" };
    expect(metadataRowsToRecord(metadataRecordToRows(metadata))).toEqual(metadata);
  });
});

describe("isSameSessionMetadata", () => {
  it("ignores key order and spots any added, removed or changed entry", () => {
    expect(isSameSessionMetadata({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(isSameSessionMetadata({ a: "1" }, { a: "1", b: "2" })).toBe(false);
    expect(isSameSessionMetadata({ a: "1", b: "2" }, { a: "1" })).toBe(false);
    expect(isSameSessionMetadata({ a: "1" }, { a: "2" })).toBe(false);
    expect(isSameSessionMetadata({}, {})).toBe(true);
  });
});
