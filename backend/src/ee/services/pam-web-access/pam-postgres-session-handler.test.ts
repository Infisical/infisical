/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type WebSocket from "ws";

import { PostgresClientMessageType, PostgresServerMessageType } from "./pam-postgres-ws-types";
import {
  SessionEndReason,
  TerminalServerMessageType,
  type TSessionContext,
  type TWebSocketServerMessage
} from "./pam-web-access-types";

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Per-client script lets individual tests stub behaviour for the Nth pg.Client
// that gets constructed. Useful for simulating mid-life failures, differing
// backend PIDs across tab controllers, etc.
type ClientScript = {
  connect?: () => Promise<void>;
  query?: (text: string, values?: unknown[]) => Promise<any>;
  end?: () => Promise<void>;
};

const clientScripts: ClientScript[] = [];
const createdClients: MockPgClient[] = [];

type MockPgClient = {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  _listeners: Record<string, Array<(...args: unknown[]) => void>>;
};

vi.mock("pg", () => {
  const makeClient = (): MockPgClient => {
    const script = clientScripts.shift() ?? {};
    const defaultQuery = vi.fn(async (text: string) => {
      if (text.includes("pg_backend_pid")) return { rows: [{ pid: 1000 + createdClients.length }] };
      return { rows: [] };
    });
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const client: MockPgClient = {
      query: vi.fn(script.query ?? defaultQuery),
      connect: vi.fn(script.connect ?? (async () => {})),
      end: vi.fn(script.end ?? (async () => {})),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      emit: (event: string, ...args: unknown[]) => {
        (listeners[event] || []).forEach((cb) => cb(...args));
      },
      _listeners: listeners
    };
    createdClients.push(client);
    return client;
  };

  return {
    default: {
      Client: vi.fn(() => makeClient())
    }
  };
});

// eslint-disable-next-line import/first
import pg from "pg";

// eslint-disable-next-line import/first
import { handlePostgresSession } from "./pam-postgres-session-handler";

function resetMockState() {
  clientScripts.length = 0;
  createdClients.length = 0;
  (pg.Client as unknown as { mockClear: () => void }).mockClear();
}

function createMockContext(): TSessionContext & { sentMessages: TWebSocketServerMessage[] } {
  const sentMessages: TWebSocketServerMessage[] = [];
  return {
    socket: {
      on: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      OPEN: 1,
      send: vi.fn()
    } as unknown as WebSocket,
    relayPort: 5432,
    resourceName: "test-db",
    sessionId: "test-session",
    sendMessage: vi.fn((msg: TWebSocketServerMessage) => {
      sentMessages.push(msg);
    }),
    sendSessionEnd: vi.fn(),
    isNearSessionExpiry: vi.fn().mockReturnValue(false),
    onCleanup: vi.fn(),
    sentMessages
  };
}

const mockParams = {
  connectionDetails: { database: "testdb", host: "localhost", port: 5432 },
  credentials: { username: "testuser" }
} as Parameters<typeof handlePostgresSession>[1];

function getMessageHandler(ctx: TSessionContext): (data: Buffer) => void {
  const messageCall = (ctx.socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
    ([event]: string[]) => event === "message"
  );
  return messageCall![1] as (data: Buffer) => void;
}

function getSentResponses(ctx: TSessionContext): any[] {
  const send = ctx.socket.send as unknown as ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return send.mock.calls.map(([raw]) => JSON.parse(raw as string));
}

async function openConnection(ctx: TSessionContext, id = "11111111-1111-1111-1111-111111111111"): Promise<string> {
  const onMessage = getMessageHandler(ctx);
  onMessage(Buffer.from(JSON.stringify({ type: PostgresClientMessageType.OpenConnection, id })));
  // Let microtasks settle for the async open flow.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
  const resp = getSentResponses(ctx).find((r) => r.type === PostgresServerMessageType.ConnectionOpened && r.id === id);
  if (!resp) throw new Error("open-connection did not ack");
  return resp.connectionId as string;
}

describe("handlePostgresSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  test("sends ready after reachability check succeeds", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    expect(ctx.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: TerminalServerMessageType.Ready }));
    // Reachability check — one short-lived client.
    expect(pg.Client).toHaveBeenCalledTimes(1);
  });

  test("tears down the WS when reachability check fails", async () => {
    clientScripts.push({
      connect: async () => {
        throw new Error("connection refused");
      }
    });
    const ctx = createMockContext();
    const result = await handlePostgresSession(ctx, mockParams);

    expect(ctx.sendSessionEnd).toHaveBeenCalledWith(SessionEndReason.SetupFailed);
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: TerminalServerMessageType.Ready })
    );
    expect(result.cleanup).toBeDefined();
  });

  test("open-connection creates a controller and returns connectionId + backendPid", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const connectionId = await openConnection(ctx);
    expect(connectionId).toMatch(/[0-9a-f-]{36}/i);
    const resp = getSentResponses(ctx).find((r) => r.type === PostgresServerMessageType.ConnectionOpened);
    expect(resp.backendPid).toBeTypeOf("number");
  });

  test("get-schemas uses a short-lived client and works with no tab controllers", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    // Script a schemas query response on the next client created.
    clientScripts.push({
      query: vi.fn(async (text: string) => {
        if (text.includes("pg_namespace")) return { rows: [{ name: "public" }] };
        return { rows: [] };
      })
    });

    const onMessage = getMessageHandler(ctx);
    const reqId = "22222222-2222-2222-2222-222222222222";
    onMessage(Buffer.from(JSON.stringify({ type: PostgresClientMessageType.GetSchemas, id: reqId })));

    await new Promise<void>((r) => {
      setTimeout(r, 20);
    });

    const responses = getSentResponses(ctx);
    const schemasResp = responses.find((r) => r.type === PostgresServerMessageType.Schemas && r.id === reqId);
    expect(schemasResp).toBeTruthy();
    expect(schemasResp.data).toEqual([{ name: "public" }]);
  });

  test("get-tables works while a tab controller is open", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);
    await openConnection(ctx);

    clientScripts.push({
      query: vi.fn(async (text: string) => {
        if (text.includes("pg_class")) return { rows: [{ name: "users", tableType: "table" }] };
        return { rows: [] };
      })
    });

    const onMessage = getMessageHandler(ctx);
    const reqId = "33333333-3333-3333-3333-333333333333";
    onMessage(Buffer.from(JSON.stringify({ type: PostgresClientMessageType.GetTables, id: reqId, schema: "public" })));

    await new Promise<void>((r) => {
      setTimeout(r, 20);
    });
    const tablesResp = getSentResponses(ctx).find((r) => r.type === PostgresServerMessageType.Tables && r.id === reqId);
    expect(tablesResp).toBeTruthy();
    expect(tablesResp.data).toEqual([{ name: "users", tableType: "table" }]);
  });

  test("unknown connectionId on tab-scoped message returns 'Connection not found'", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const onMessage = getMessageHandler(ctx);
    const reqId = "44444444-4444-4444-4444-444444444444";
    onMessage(
      Buffer.from(
        JSON.stringify({
          type: PostgresClientMessageType.Query,
          id: reqId,
          connectionId: "99999999-9999-9999-9999-999999999999",
          sql: "SELECT 1"
        })
      )
    );

    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    const err = getSentResponses(ctx).find((r) => r.type === PostgresServerMessageType.Error && r.id === reqId);
    expect(err).toBeTruthy();
    expect(err.error).toContain("Connection not found");
  });

  test("close-connection on unknown id is a silent no-op", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const onMessage = getMessageHandler(ctx);
    onMessage(
      Buffer.from(
        JSON.stringify({
          type: PostgresClientMessageType.CloseConnection,
          connectionId: "99999999-9999-9999-9999-999999999999"
        })
      )
    );

    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    const responses = getSentResponses(ctx);
    // No response ever sent for close-connection.
    expect(responses.filter((r) => r.type === PostgresServerMessageType.ConnectionClosed)).toEqual([]);
    expect(responses.filter((r) => r.type === PostgresServerMessageType.Error)).toEqual([]);
  });

  test("cancel on unknown connectionId is a silent no-op", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const onMessage = getMessageHandler(ctx);
    onMessage(
      Buffer.from(
        JSON.stringify({
          type: PostgresClientMessageType.Cancel,
          connectionId: "99999999-9999-9999-9999-999999999999"
        })
      )
    );

    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    expect(getSentResponses(ctx)).toEqual([]);
  });

  test("activity keepalive is accepted and emits no response", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const onMessage = getMessageHandler(ctx);
    onMessage(Buffer.from(JSON.stringify({ type: PostgresClientMessageType.Activity })));

    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    expect(getSentResponses(ctx)).toEqual([]);
    expect(ctx.sendSessionEnd).not.toHaveBeenCalled();
  });

  test("server-initiated controller death removes entry and emits connection-closed", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);
    const connectionId = await openConnection(ctx);

    // Grab the tab controller's pg.Client (created after reachability client).
    const tabClient = createdClients[1];
    tabClient.emit("error", new Error("peer reset"));

    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    const closedEvt = getSentResponses(ctx).find(
      (r) => r.type === PostgresServerMessageType.ConnectionClosed && r.connectionId === connectionId
    );
    expect(closedEvt).toBeTruthy();
    expect(closedEvt.reason).toBe("peer reset");

    // Subsequent tab-scoped message for the same id should now miss.
    const onMessage = getMessageHandler(ctx);
    const reqId = "55555555-5555-5555-5555-555555555555";
    onMessage(
      Buffer.from(
        JSON.stringify({
          type: PostgresClientMessageType.Query,
          id: reqId,
          connectionId,
          sql: "SELECT 1"
        })
      )
    );
    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    const err = getSentResponses(ctx).find((r) => r.type === PostgresServerMessageType.Error && r.id === reqId);
    expect(err.error).toContain("Connection not found");
  });

  test("exceeding MAX_CONNECTIONS_PER_WS returns connection-open-failed", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await openConnection(ctx, `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, "0")}`);
    }

    const onMessage = getMessageHandler(ctx);
    const overflowId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    onMessage(Buffer.from(JSON.stringify({ type: PostgresClientMessageType.OpenConnection, id: overflowId })));
    await new Promise<void>((r) => {
      setTimeout(r, 10);
    });
    const failed = getSentResponses(ctx).find(
      (r) => r.type === PostgresServerMessageType.ConnectionOpenFailed && r.id === overflowId
    );
    expect(failed).toBeTruthy();
    expect(failed.error).toContain("Maximum");
  });

  test("concurrent open-connection requests cannot bypass the cap", async () => {
    // Simulates a client firing 25 opens at once. Without the pendingOpens
    // counter, each check against controllers.size would see 0 before any
    // controller finished connecting, and all 25 would succeed.
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const onMessage = getMessageHandler(ctx);
    const ATTEMPTS = 25;
    for (let i = 0; i < ATTEMPTS; i += 1) {
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: PostgresClientMessageType.OpenConnection,
            id: `eeeeeeee-eeee-eeee-eeee-${String(i).padStart(12, "0")}`
          })
        )
      );
    }

    await new Promise<void>((r) => {
      setTimeout(r, 50);
    });

    const opened = getSentResponses(ctx).filter((r) => r.type === PostgresServerMessageType.ConnectionOpened);
    const failed = getSentResponses(ctx).filter((r) => r.type === PostgresServerMessageType.ConnectionOpenFailed);
    expect(opened.length).toBe(20);
    expect(failed.length).toBe(ATTEMPTS - 20);
  });

  test("cleanup disposes every controller", async () => {
    const ctx = createMockContext();
    const result = await handlePostgresSession(ctx, mockParams);
    await openConnection(ctx, "cccccccc-cccc-cccc-cccc-cccccccccccc");
    await openConnection(ctx, "dddddddd-dddd-dddd-dddd-dddddddddddd");

    const tabClients = createdClients.slice(1, 3);

    await result.cleanup();

    tabClients.forEach((c) => {
      expect(c.end).toHaveBeenCalled();
    });
  });

  test("two tab controllers have independent backendPids", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    await openConnection(ctx, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    await openConnection(ctx, "ffffffff-ffff-ffff-ffff-ffffffffffff");

    const opens = getSentResponses(ctx).filter((r) => r.type === PostgresServerMessageType.ConnectionOpened);
    expect(opens).toHaveLength(2);
    expect(opens[0].backendPid).not.toBe(opens[1].backendPid);
  });
});
