/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type WebSocket from "ws";

import { PostgresClientMessageType, PostgresServerMessageType } from "./pam-postgres-ws-types";
import { TerminalServerMessageType, type TSessionContext, type TWebSocketServerMessage } from "./pam-web-access-types";

// Mock logger
vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock the REPL (terminal sessions create one eagerly)
vi.mock("./pam-web-access-repl", () => ({
  createPamSqlRepl: vi.fn(() => ({
    getPrompt: vi.fn().mockReturnValue("=> "),
    clearBuffer: vi.fn(),
    processInput: vi.fn().mockResolvedValue({ output: "", prompt: "=> ", shouldClose: false })
  }))
}));

// Mock pg
vi.mock("pg", () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  const mockOn = vi.fn();

  return {
    default: {
      Client: vi.fn(() => ({
        query: mockQuery,
        connect: mockConnect,
        end: mockEnd,
        on: mockOn
      }))
    }
  };
});

// eslint-disable-next-line import/first
import pg from "pg";

// eslint-disable-next-line import/first
import { handlePostgresSession } from "./pam-postgres-session-handler";

type MockPgClient = {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

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

function getPgInstance(): MockPgClient {
  const ClientMock = pg.Client as unknown as { mock: { results: { value: MockPgClient }[] } };
  return ClientMock.mock.results[ClientMock.mock.results.length - 1].value;
}

describe("handlePostgresSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("connects to database and sends ready message", async () => {
    const ctx = createMockContext();
    const result = await handlePostgresSession(ctx, mockParams);

    expect(pg.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 5432,
        user: "testuser",
        database: "testdb"
      })
    );
    expect(ctx.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TerminalServerMessageType.Ready
      })
    );
    expect(result.cleanup).toBeDefined();
  });

  test("registers message handler on socket", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    expect(ctx.socket.on).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("cleanup closes pg client", async () => {
    const ctx = createMockContext();
    const result = await handlePostgresSession(ctx, mockParams);
    const pgInstance = getPgInstance();

    await result.cleanup();
    expect(pgInstance.end).toHaveBeenCalled();
  });

  test("handles get-schemas data explorer message", async () => {
    const ctx = createMockContext();
    await handlePostgresSession(ctx, mockParams);

    const pgInstance = getPgInstance();
    pgInstance.query.mockResolvedValue({
      rows: [{ name: "public" }, { name: "auth" }]
    });

    // Get the message handler callback
    const messageCall = (ctx.socket.on as ReturnType<typeof vi.fn>).mock.calls.find(
      ([event]: string[]) => event === "message"
    );
    const onMessage = messageCall?.[1] as ((data: Buffer) => void) | undefined;

    if (onMessage) {
      const msg = Buffer.from(
        JSON.stringify({ type: PostgresClientMessageType.GetSchemas, id: "550e8400-e29b-41d4-a716-446655440000" })
      );
      onMessage(msg);

      // Wait for async processing
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect((ctx.socket as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
        expect.stringContaining(`"${PostgresServerMessageType.Schemas}"`)
      );
    }
  });
});
