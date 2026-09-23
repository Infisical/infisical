import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseActivityRecords } from "./activityDecrypt";

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
