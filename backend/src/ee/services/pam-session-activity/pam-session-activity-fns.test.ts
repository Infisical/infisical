import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import {
  buildPamSessionActivityEvents,
  TPamSessionActivitySession,
  toPamSessionActivityStreamEvent
} from "./pam-session-activity-fns";
import { PamSessionActivityEventType, PamSessionActivitySkipReason } from "./pam-session-activity-types";

const session: TPamSessionActivitySession = {
  id: "0f0e0d0c-0b0a-4908-8706-050403020100",
  projectId: "pam-project",
  accountId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  accountName: "prod-db",
  accountType: "postgres",
  folderName: "databases",
  selectedHost: null,
  userId: "11111111-2222-4333-8444-555555555555",
  identityId: null,
  actorName: "Jane Doe",
  actorEmail: "jane@example.com",
  actorIp: "10.0.0.7",
  actorUserAgent: "infisical-cli"
};

const timestamp = "2026-11-19T10:00:00.000Z";
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const terminal = (eventType: "input" | "output", text: string, extra: Record<string, unknown> = {}) => ({
  timestamp,
  eventType,
  channelType: "terminal",
  data: b64(text),
  rendered: true,
  elapsedTime: 1,
  ...extra
});

const build = (events: unknown[], chunkIndex = 0, sessionOverrides: Partial<TPamSessionActivitySession> = {}) =>
  buildPamSessionActivityEvents({ session: { ...session, ...sessionOverrides }, orgId: "org-1", chunkIndex, events });

describe("buildPamSessionActivityEvents", () => {
  test("turns a database entry into a query that carries its result", () => {
    const [event] = build([{ timestamp, input: "SELECT * FROM users", output: "SELECT 3" }]);

    expect(event).toMatchObject({
      createdAt: timestamp,
      orgId: "org-1",
      projectId: "pam-project",
      eventType: PamSessionActivityEventType.Query,
      actor: ActorType.USER,
      actorMetadata: { userId: session.userId, email: "jane@example.com", username: "jane@example.com" },
      ipAddress: "10.0.0.7",
      eventMetadata: {
        sessionId: session.id,
        accountName: "prod-db",
        accountType: "postgres",
        query: "SELECT * FROM users",
        output: "SELECT 3"
      }
    });
  });

  test("names identity actors by identity, including one deleted mid-session", () => {
    const identityId = "99999999-8888-4777-8666-555555555555";
    const [live] = build([{ timestamp, input: "SELECT 1", output: "" }], 0, {
      userId: null,
      identityId,
      actorEmail: ""
    });
    const [deleted] = build([{ timestamp, input: "SELECT 1", output: "" }], 0, {
      userId: null,
      identityId: null,
      actorEmail: ""
    });

    expect(live.actor).toBe(ActorType.IDENTITY);
    expect(live.actorMetadata).toEqual({ identityId, name: "Jane Doe" });
    expect(deleted.actor).toBe(ActorType.IDENTITY);
    expect(deleted.actorMetadata).toEqual({ identityId: null, name: "Jane Doe" });
  });

  test("strips the prompt the gateway adds to exec commands", () => {
    const [event] = build([terminal("input", "$ ls -la /etc", { channelType: "exec" })]);

    expect(event.eventType).toBe(PamSessionActivityEventType.Command);
    expect(event.eventMetadata).toMatchObject({ channel: "exec", command: "ls -la /etc" });
  });

  test("never sends unechoed shell input, exec stdin or forwarded traffic", () => {
    const events = build([
      terminal("input", "hunter2"),
      terminal("input", "DB_PASSWORD=s3cret", { channelType: "exec" }),
      terminal("input", "Authorization: Basic dXNlcjpwYXNz", { channelType: undefined })
    ]);

    expect(events).toEqual([]);
  });

  test("reports an echoed shell command and groups the lines around it into output events", () => {
    const events = build([
      terminal("output", "Welcome to prod"),
      terminal("output", "Last login: today"),
      terminal("output", "jane@prod:~$ whoami", { command: "whoami" }),
      terminal("output", "jane")
    ]);

    expect(events.map((event) => event.eventType)).toEqual([
      PamSessionActivityEventType.Output,
      PamSessionActivityEventType.Command,
      PamSessionActivityEventType.Output
    ]);
    expect(events[0].eventMetadata.output).toBe("Welcome to prod\nLast login: today");
    expect(events[1].eventMetadata.command).toBe("whoami");
    expect(events[2].eventMetadata.output).toBe("jane");
  });

  test("marks commands and statements a policy blocked", () => {
    const events = build([
      terminal("input", "$ rm -rf /\n[BLOCKED] Command not permitted", { channelType: "exec", blocked: true }),
      terminal("output", "jane@prod:~$ rm -rf /", { command: "rm -rf /" }),
      terminal("output", "[BLOCKED] Command not permitted", { blocked: true }),
      { timestamp, input: "DROP TABLE users", output: "BLOCKED: matches DROP" }
    ]);

    expect(events.map((event) => [event.eventType, event.eventMetadata.blocked])).toEqual([
      [PamSessionActivityEventType.Command, true],
      [PamSessionActivityEventType.Command, true],
      [PamSessionActivityEventType.Query, true]
    ]);
    expect(events[0].eventMetadata.command).toBe("rm -rf /");
  });

  test("takes a block only from the gateway's flag, never from recorded text", () => {
    const events = build([
      terminal("input", "$ id\n[BLOCKED] Command not permitted", { channelType: "exec" }),
      terminal("output", "jane@prod:~$ echo '[BLOCKED] Command not permitted'", {
        command: "echo '[BLOCKED] Command not permitted'"
      }),
      terminal("output", "[BLOCKED] Command not permitted"),
      terminal("input", "$ bash", { channelType: "exec" }),
      terminal("output", "[BLOCKED] Command not permitted", { channelType: "exec", blocked: true })
    ]);

    expect(events.map((event) => [event.eventType, event.eventMetadata.blocked])).toEqual([
      [PamSessionActivityEventType.Command, undefined],
      [PamSessionActivityEventType.Command, undefined],
      [PamSessionActivityEventType.Output, undefined],
      [PamSessionActivityEventType.Command, undefined],
      [PamSessionActivityEventType.Output, undefined]
    ]);
    expect(events[0].eventMetadata.command).toBe("id\n[BLOCKED] Command not permitted");
  });

  test("keeps HTTP requests and responses apart", () => {
    const events = build([
      { timestamp, eventType: "request", requestId: "r1", method: "DELETE", url: "/api/v1/pods/web", headers: {} },
      { timestamp, eventType: "response", requestId: "r1", status: "200 OK", headers: {}, body: b64('{"kind":"Pod"}') }
    ]);

    expect(events[0]).toMatchObject({
      eventType: PamSessionActivityEventType.Request,
      eventMetadata: { requestId: "r1", method: "DELETE", url: "/api/v1/pods/web" }
    });
    expect(events[1]).toMatchObject({
      eventType: PamSessionActivityEventType.Response,
      eventMetadata: { requestId: "r1", status: "200 OK", body: '{"kind":"Pod"}' }
    });
  });

  test("skips RDP events and anything that isn't a recorded event", () => {
    const events = build([
      { timestamp, eventType: "rdp", channelType: "rdp", data: b64('{"type":"keyboard"}') },
      { timestamp, eventType: "input", channelType: "rdp", data: b64("x") },
      "not an event",
      null
    ]);

    expect(events).toEqual([]);
  });

  test("truncates oversized output", () => {
    const [event] = build([{ timestamp, input: "SELECT blob FROM files", output: "x".repeat(70_000) }]);

    expect(event.eventMetadata.output?.endsWith(" [truncated]")).toBe(true);
    expect(event.eventMetadata.output?.length).toBeLessThan(70_000);
  });

  test("reports what it can't map from an oversized chunk instead of dropping it silently", () => {
    const entries = Array.from({ length: 50_002 }, () => ({ timestamp, input: "SELECT 1", output: "" }));

    const events = build(entries);

    expect(events).toHaveLength(50_001);
    expect(events[50_000]).toMatchObject({
      eventType: PamSessionActivityEventType.Skipped,
      eventMetadata: { reason: PamSessionActivitySkipReason.TooManyEvents, skippedEvents: 2 }
    });
  });

  test("removes terminal escape sequences from what it sends", () => {
    const [event] = build([terminal("input", "$ ls\u001b[31m --color\u001b[0m", { channelType: "exec" })]);

    expect(event.eventMetadata.command).toBe("ls --color");
  });

  test("derives the same ids for the same chunk, and different ids for another chunk", () => {
    const events = [{ timestamp, input: "SELECT 1", output: "" }];

    expect(build(events, 3)[0].id).toBe(build(events, 3)[0].id);
    expect(build(events, 3)[0].id).not.toBe(build(events, 4)[0].id);
  });
});

describe("toPamSessionActivityStreamEvent", () => {
  const [query, request, response] = build([
    { timestamp, input: "SELECT secret FROM vault", output: "hunter2" },
    { timestamp, eventType: "request", requestId: "r1", method: "POST", url: "/secrets", body: b64("{}") },
    { timestamp, eventType: "response", requestId: "r1", status: "201", body: b64("{}") }
  ]);

  test("sends everything to a stream that includes output", () => {
    expect(toPamSessionActivityStreamEvent(query, true)).toBe(query);
    expect(toPamSessionActivityStreamEvent(response, true)).toBe(response);
  });

  test("drops results and bodies for a stream without output", () => {
    expect(toPamSessionActivityStreamEvent(query, false)?.eventMetadata).not.toHaveProperty("output");
    expect(toPamSessionActivityStreamEvent(query, false)?.eventMetadata.query).toBe("SELECT secret FROM vault");
    expect(toPamSessionActivityStreamEvent(request, false)?.eventMetadata).not.toHaveProperty("body");
    expect(toPamSessionActivityStreamEvent(response, false)).toBeNull();
  });
});
