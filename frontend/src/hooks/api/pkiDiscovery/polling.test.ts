import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPkiDiscoveryRefetchInterval,
  isPkiDiscoveryScanInFlight,
  SCAN_IDLE_POLL_MS,
  SCAN_IN_FLIGHT_POLL_MS
} from "./polling";
import { PkiDiscoveryScanStatus } from "./types";

describe("isPkiDiscoveryScanInFlight", () => {
  it("is true while a scan is pending or running", () => {
    assert.equal(isPkiDiscoveryScanInFlight(PkiDiscoveryScanStatus.Pending), true);
    assert.equal(isPkiDiscoveryScanInFlight(PkiDiscoveryScanStatus.Running), true);
  });

  it("is false for terminal or missing statuses", () => {
    assert.equal(isPkiDiscoveryScanInFlight(PkiDiscoveryScanStatus.Completed), false);
    assert.equal(isPkiDiscoveryScanInFlight(PkiDiscoveryScanStatus.Failed), false);
    assert.equal(isPkiDiscoveryScanInFlight(null), false);
    assert.equal(isPkiDiscoveryScanInFlight(undefined), false);
  });
});

describe("getPkiDiscoveryRefetchInterval", () => {
  it("polls fast while a scan is in flight", () => {
    assert.equal(
      getPkiDiscoveryRefetchInterval(PkiDiscoveryScanStatus.Pending),
      SCAN_IN_FLIGHT_POLL_MS
    );
    assert.equal(
      getPkiDiscoveryRefetchInterval(PkiDiscoveryScanStatus.Running),
      SCAN_IN_FLIGHT_POLL_MS
    );
  });

  it("falls back to the slow idle poll once a scan is terminal", () => {
    assert.equal(
      getPkiDiscoveryRefetchInterval(PkiDiscoveryScanStatus.Completed),
      SCAN_IDLE_POLL_MS
    );
    assert.equal(getPkiDiscoveryRefetchInterval(PkiDiscoveryScanStatus.Failed), SCAN_IDLE_POLL_MS);
    assert.equal(getPkiDiscoveryRefetchInterval(null), SCAN_IDLE_POLL_MS);
    assert.equal(getPkiDiscoveryRefetchInterval(undefined), SCAN_IDLE_POLL_MS);
  });

  it("keeps polling while idle so a newly started scan is noticed", () => {
    assert.notEqual(getPkiDiscoveryRefetchInterval(PkiDiscoveryScanStatus.Completed), false);
    assert.ok(SCAN_IDLE_POLL_MS > SCAN_IN_FLIGHT_POLL_MS);
  });
});
