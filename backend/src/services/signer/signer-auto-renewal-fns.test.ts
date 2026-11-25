import { describe, expect, it } from "vitest";

import { isSignerRenewalDue } from "./signer-auto-renewal-fns";

const now = new Date("2026-11-03T12:00:00.000Z").getTime();
const inDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000);

describe("isSignerRenewalDue", () => {
  it("renews a certificate that expires inside the renew-before window", () => {
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: 20, certificateNotAfter: inDays(5) }, now)).toBe(true);
  });

  it("renews a certificate that expires exactly at the window's edge", () => {
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: 20, certificateNotAfter: inDays(20) }, now)).toBe(true);
  });

  it("leaves a certificate that expires after the window", () => {
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: 20, certificateNotAfter: inDays(30) }, now)).toBe(false);
  });

  it("leaves a signer with auto-renewal off", () => {
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: null, certificateNotAfter: inDays(1) }, now)).toBe(false);
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: 0, certificateNotAfter: inDays(1) }, now)).toBe(false);
  });

  it("renews a signer with auto-renewal on and no certificate expiry", () => {
    expect(isSignerRenewalDue({ certificateRenewBeforeDays: 20, certificateNotAfter: null }, now)).toBe(true);
  });
});
