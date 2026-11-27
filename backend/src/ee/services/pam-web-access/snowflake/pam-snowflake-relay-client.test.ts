import { describe, expect, test, vi } from "vitest";

import { connectThroughRelay } from "./pam-snowflake-relay-client";

const { createConnection } = vi.hoisted(() => ({
  createConnection: vi.fn(() => ({ connectAsync: vi.fn(() => Promise.resolve()), destroy: vi.fn() }))
}));

vi.mock("snowflake-sdk", () => ({ default: { createConnection } }));

describe("connectThroughRelay", () => {
  test("sets a fixed array binding threshold on the connection", async () => {
    await connectThroughRelay(4100, "org-account");

    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        accessUrl: "http://127.0.0.1:4100",
        arrayBindingThreshold: Number.MAX_SAFE_INTEGER
      })
    );
  });
});
