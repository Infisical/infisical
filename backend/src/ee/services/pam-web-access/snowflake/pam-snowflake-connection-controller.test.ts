import { beforeEach, describe, expect, test, vi } from "vitest";

import { DataExplorerClientMessageType, DataExplorerServerMessageType } from "../pam-data-explorer-ws-types";
import { createSnowflakeConnectionController } from "./pam-snowflake-connection-controller";

const { client } = vi.hoisted(() => ({
  client: {
    execute: vi.fn(),
    isUp: vi.fn(() => true),
    destroy: vi.fn()
  }
}));

vi.mock("./pam-snowflake-relay-client", () => ({ connectThroughRelay: vi.fn(() => Promise.resolve(client)) }));

const QUERY_ID = "6f1c2a3e-8b4d-4e5f-9a6b-7c8d9e0f1a2b";

const startController = async () => {
  const sendResponse = vi.fn();
  const controller = await createSnowflakeConnectionController({
    sessionId: "session-1",
    connectionId: "connection-1",
    sendResponse,
    onUnexpectedTermination: vi.fn(),
    relayPort: 1,
    username: "analyst",
    connectionDetails: { account: "org-account" }
  });
  return { controller, sendResponse };
};

describe("createSnowflakeConnectionController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(["PUT file://data.csv @~", "get @~ file://downloads", "SELECT 1; PUT file://data.csv @~"])(
    "rejects the whole query without running any statement when one is PUT or GET: %j",
    async (sql) => {
      const { controller, sendResponse } = await startController();

      controller.handleMessage({ type: DataExplorerClientMessageType.Query, id: QUERY_ID, sql } as Parameters<
        typeof controller.handleMessage
      >[0]);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DataExplorerServerMessageType.Error,
          id: QUERY_ID,
          error: "PUT and GET statements are not supported"
        })
      );
      expect(client.execute.mock.calls.map(([options]) => (options as { sqlText: string }).sqlText)).not.toContainEqual(
        expect.stringMatching(/^\s*(put|get)/i)
      );
    }
  );
});
