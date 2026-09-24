import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseActivityRecords, recordsMatchChunk } from "./activityDecrypt";

const record = {
  ts: "2026-09-23T10:00:00.000Z",
  seq: 0,
  proxyId: "proxy-1",
  method: "GET",
  host: "api.github.com",
  port: "443",
  path: "/",
  status: 200,
  decision: "passthrough",
  service: null,
  accessBundle: null
};

describe("parseActivityRecords", () => {
  it("accepts records in the shape the proxy writes", () => {
    assert.deepEqual(parseActivityRecords([record]), [record]);
  });

  it("refuses a record whose host is not a string, which search would throw on", () => {
    assert.equal(parseActivityRecords([record, { ...record, host: 42 }]), null);
  });

  it("refuses a record whose timestamp is not a date, which the table would throw on", () => {
    assert.equal(parseActivityRecords([{ ...record, ts: "nope" }]), null);
  });

  it("refuses anything that is not an array of records", () => {
    assert.equal(parseActivityRecords({ records: [record] }), null);
  });
});

describe("recordsMatchChunk", () => {
  const chunk = { proxyId: "proxy-1", recordCount: 2, firstSeq: 10, lastSeq: 12 };
  const records = parseActivityRecords([
    { ...record, seq: 10 },
    { ...record, seq: 12 }
  ])!;

  it("accepts records that match the batch they came in, gaps in the sequence included", () => {
    assert.equal(recordsMatchChunk(records, chunk), true);
  });

  it("refuses a record that claims another proxy", () => {
    assert.equal(
      recordsMatchChunk([records[0], { ...records[1], proxyId: "proxy-2" }], chunk),
      false
    );
  });

  it("refuses more or fewer records than the batch counts", () => {
    assert.equal(recordsMatchChunk(records.slice(0, 1), chunk), false);
  });

  it("refuses a sequence number outside the batch's range", () => {
    assert.equal(recordsMatchChunk([records[0], { ...records[1], seq: 13 }], chunk), false);
  });
});
