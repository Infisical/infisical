import { describe, expect, test, vi } from "vitest";

import { createPamWebServerSessionManager } from "./pam-web-server-session-manager";

describe("PAM Web Server session manager", () => {
  test("returns a session only for the matching account and cookie secret", async () => {
    const manager = createPamWebServerSessionManager();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const created = manager.createSession({
      accountId: "account-id",
      userId: "user-id",
      pamSessionId: "pam-session-id",
      upstreamUrl: new URL("https://internal.example.com/login"),
      relayPort: 12345,
      authorization: "Basic dXNlcjpwYXNz",
      expiresAt: new Date(Date.now() + 60_000),
      cleanup
    });

    expect(manager.getSession(created.id, "account-id", created.cookieSecret)?.pamSessionId).toBe("pam-session-id");
    expect(manager.getSession(created.id, "other-account", created.cookieSecret)).toBeNull();
    expect(manager.getSession(created.id, "account-id", "wrong-secret")).toBeNull();

    await manager.closeSession(created.id);
  });

  test("cleans up a session once when it is closed", async () => {
    const manager = createPamWebServerSessionManager();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const created = manager.createSession({
      accountId: "account-id",
      userId: "user-id",
      pamSessionId: "pam-session-id",
      upstreamUrl: new URL("https://internal.example.com"),
      relayPort: 12345,
      authorization: "Basic dXNlcjpwYXNz",
      expiresAt: new Date(Date.now() + 60_000),
      cleanup
    });

    await manager.closeSession(created.id);
    await manager.closeSession(created.id);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(manager.getSession(created.id, "account-id", created.cookieSecret)).toBeNull();
  });

  test("expires and cleans up a session", async () => {
    vi.useFakeTimers();
    const manager = createPamWebServerSessionManager();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const created = manager.createSession({
      accountId: "account-id",
      userId: "user-id",
      pamSessionId: "pam-session-id",
      upstreamUrl: new URL("https://internal.example.com"),
      relayPort: 12345,
      authorization: "Basic dXNlcjpwYXNz",
      expiresAt: new Date(Date.now() + 1_000),
      cleanup
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(manager.getSession(created.id, "account-id", created.cookieSecret)).toBeNull();
    vi.useRealTimers();
  });
});
