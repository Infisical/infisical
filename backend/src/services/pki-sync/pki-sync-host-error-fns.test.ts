import { describe, expect, it } from "vitest";

import { describeHostFailure, HostProbeTimeoutError, withReachabilityDeadline } from "./pki-sync-host-error-fns";

describe("describeHostFailure", () => {
  it("names the host and the Gateway when the transport could not connect", () => {
    const message = describeHostFailure({
      error: new Error("WinRM gateway operation failed: failed to connect to the Windows host over WinRM"),
      host: "EC2AMAZ-8V4780K.corp.example.com",
      gatewayLabel: "carlos-gw",
      transport: "WinRM"
    });

    expect(message).toContain('target host "EC2AMAZ-8V4780K.corp.example.com"');
    expect(message).toContain('Gateway "carlos-gw"');
  });

  it("treats a probe deadline as unreachable", () => {
    expect(
      describeHostFailure({
        error: new HostProbeTimeoutError("Reachability probe deadline exceeded"),
        host: "172.31.99.99",
        gatewayLabel: "carlos-gw",
        transport: "SSH"
      })
    ).toContain('Could not reach the target host "172.31.99.99" over SSH');
  });

  it("falls back to naming the connection when the Gateway name is unknown", () => {
    expect(
      describeHostFailure({
        error: new Error("dial tcp 10.0.0.5:5986: i/o timeout"),
        host: "10.0.0.5",
        gatewayLabel: undefined,
        transport: "WinRM"
      })
    ).toContain("from the Gateway assigned to this connection");
  });

  it("passes a failure that is not a connectivity problem through untouched", () => {
    const original = "Access is denied for user CORP\\svc-certs";
    expect(
      describeHostFailure({ error: new Error(original), host: "host-a", gatewayLabel: "gw", transport: "WinRM" })
    ).toBe(original);
  });

  it("passes the failure through when no host is known", () => {
    expect(
      describeHostFailure({
        error: new Error("failed to connect"),
        host: undefined,
        gatewayLabel: "gw",
        transport: "SSH"
      })
    ).toBe("failed to connect");
  });
});

describe("withReachabilityDeadline", () => {
  it("returns the probe result when it settles in time", async () => {
    await expect(withReachabilityDeadline(async () => "ok")).resolves.toBe("ok");
  });

  it("rejects with a deadline error when the probe outlasts the budget", async () => {
    await expect(
      withReachabilityDeadline(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 20_000);
          })
      )
    ).rejects.toBeInstanceOf(HostProbeTimeoutError);
  }, 20_000);

  it("surfaces the probe's own failure rather than the deadline", async () => {
    await expect(withReachabilityDeadline(() => Promise.reject(new Error("connection refused")))).rejects.toThrow(
      "connection refused"
    );
  });
});
