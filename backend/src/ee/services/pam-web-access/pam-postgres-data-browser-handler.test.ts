/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type WebSocket from "ws";

import type { TDataBrowserServerMessage, TDataBrowserSessionContext } from "./pam-web-access-types";

// Mock logger
vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock pg
vi.mock("pg", () => {
  const mockQuery = vi.fn();
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
import { handlePostgresDataBrowser } from "./pam-postgres-data-browser-handler";

type MockPgClient = {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createMockContext(): TDataBrowserSessionContext & { sentMessages: TDataBrowserServerMessage[] } {
  const sentMessages: TDataBrowserServerMessage[] = [];
  return {
    socket: {
      on: vi.fn(),
      close: vi.fn(),
      readyState: 1
    } as unknown as WebSocket,
    relayPort: 5432,
    resourceName: "test-db",
    sessionId: "test-session",
    sendMessage: vi.fn((msg: TDataBrowserServerMessage) => {
      sentMessages.push(msg);
    }),
    sendReady: vi.fn(),
    sendSessionEnd: vi.fn(),
    isNearSessionExpiry: vi.fn().mockReturnValue(false),
    onCleanup: vi.fn(),
    sentMessages
  };
}

const mockParams = {
  connectionDetails: { database: "testdb", host: "localhost", port: 5432 },
  credentials: { username: "testuser" }
} as Parameters<typeof handlePostgresDataBrowser>[1];

function getPgInstance(): MockPgClient {
  const ClientMock = pg.Client as unknown as { mock: { results: { value: MockPgClient }[] } };
  return ClientMock.mock.results[ClientMock.mock.results.length - 1].value;
}

describe("handlePostgresDataBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("connects to database and sends ready message", async () => {
    const ctx = createMockContext();
    const result = await handlePostgresDataBrowser(ctx, mockParams);

    expect(pg.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 5432,
        user: "testuser",
        database: "testdb"
      })
    );
    expect(ctx.sendReady).toHaveBeenCalled();
    expect(result.cleanup).toBeDefined();
  });

  test("registers message handler on socket", async () => {
    const ctx = createMockContext();
    await handlePostgresDataBrowser(ctx, mockParams);

    expect(ctx.socket.on).toHaveBeenCalledWith("message", expect.any(Function));
  });

  test("cleanup closes pg client", async () => {
    const ctx = createMockContext();
    const result = await handlePostgresDataBrowser(ctx, mockParams);
    const pgInstance = getPgInstance();

    await result.cleanup();
    expect(pgInstance.end).toHaveBeenCalled();
  });

  test("handles pg-get-schemas message", async () => {
    const ctx = createMockContext();
    await handlePostgresDataBrowser(ctx, mockParams);

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
      const msg = Buffer.from(JSON.stringify({ type: "pg-get-schemas", id: "req-1" }));
      onMessage(msg);

      // Wait for async processing
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(ctx.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "pg-schemas",
          id: "req-1"
        })
      );
    }
  });
});
