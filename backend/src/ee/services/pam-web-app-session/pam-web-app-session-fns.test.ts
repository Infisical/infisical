import {
  assertWebWorkerTransition,
  webLaunchPayloadHash,
  webLeaseSeconds,
  webLeaseUntil,
  webStopConfirmation
} from "./pam-web-app-session-fns";

describe("PAM Web App lifecycle", () => {
  test("failure does not confirm stop, and a subsequent confirmed stop is permitted", () => {
    const now = Date.now();
    expect(webStopConfirmation(null, new Date(now), now)).toBe("pending");
    expect(webStopConfirmation(null, new Date(now - 31_000), now)).toBe("not-confirmed");
    expect(webStopConfirmation(new Date(now), null, now)).toBe("confirmed");
    expect(() => assertWebWorkerTransition("failed", "stopped")).not.toThrow();
    expect(() => assertWebWorkerTransition("failed", "active")).toThrow();
    expect(() => assertWebWorkerTransition("ending", "active")).toThrow();
    expect(() => assertWebWorkerTransition("active", "active")).not.toThrow();
  });
  test("caps renewable leases at the hard expiry and remaining access", () => {
    const now = 100_000;
    expect(webLeaseUntil(new Date(500_000), null, now).getTime()).toBe(145_000);
    expect(webLeaseUntil(new Date(110_000), null, now).getTime()).toBe(110_000);
    expect(webLeaseUntil(new Date(500_000), 5000, now).getTime()).toBe(105_000);
    expect(webLeaseUntil(new Date(500_000), -1, now).getTime()).toBe(now);
    expect(webLeaseSeconds(new Date(145_999), new Date(500_000), now)).toBe(45);
    expect(webLeaseSeconds(new Date(145_000), new Date(101_000), now)).toBe(1);
    expect(webLeaseSeconds(new Date(99_000), new Date(500_000), now)).toBe(0);
  });
  test("binds idempotency to the account and normalized reason", () => {
    expect(webLaunchPayloadHash("a", " incident ")).toEqual(webLaunchPayloadHash("a", "incident"));
    expect(webLaunchPayloadHash("a", "incident")).not.toEqual(webLaunchPayloadHash("b", "incident"));
    expect(webLaunchPayloadHash("a", "incident")).not.toEqual(webLaunchPayloadHash("a", "other"));
  });
});
