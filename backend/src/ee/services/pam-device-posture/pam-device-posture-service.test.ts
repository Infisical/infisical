import { describe, expect, test } from "vitest";

import { getBoundGrants, getUnboundGrant } from "./pam-device-posture-service";

const bound = (serial: string, minutes = 60) => ({
  attributes: { deviceSerialNumber: serial },
  expiresAt: new Date(Date.now() + minutes * 60_000)
});
const unbound = () => ({ attributes: {}, expiresAt: new Date(Date.now() + 60 * 60_000) });

describe("getBoundGrants", () => {
  test("binds when every active grant names a device", () => {
    expect(getBoundGrants([bound("A"), bound("B")])).toHaveLength(2);
  });

  test("doesn't bind when any active grant allows any device", () => {
    expect(getBoundGrants([bound("A"), unbound()])).toBeNull();
  });

  test("ignores expired grants", () => {
    expect(getBoundGrants([bound("A", -1)])).toBeNull();
    expect(getBoundGrants([bound("A"), { ...unbound(), expiresAt: new Date(Date.now() - 1000) }])).toHaveLength(1);
  });

  test("doesn't bind without grants", () => {
    expect(getBoundGrants([])).toBeNull();
  });
});

describe("getUnboundGrant", () => {
  test("picks the longest lasting grant that allows any device", () => {
    const short = { attributes: {}, expiresAt: new Date(Date.now() + 60_000) };
    const long = { attributes: {}, expiresAt: new Date(Date.now() + 120_000) };
    expect(getUnboundGrant([bound("A", 600), short, long])).toBe(long);
  });

  test("returns null when every grant is bound", () => {
    expect(getUnboundGrant([bound("A")])).toBeNull();
  });
});
