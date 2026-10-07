import { describe, expect, test } from "vitest";

import {
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS,
  AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES
} from "./agent-vault-session-log-constants";
import { encodeHistoryCursor, encodeTailCursor } from "./agent-vault-session-log-fns";
import {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogHistoryQuerySchema,
  AgentVaultSessionLogSettingsUpdateSchema,
  AgentVaultSessionLogTailQuerySchema
} from "./agent-vault-session-log-schemas";

const validChunk = {
  chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab",
  startedAt: "2026-09-16T10:30:00.000Z",
  endedAt: "2026-09-16T10:31:00.000Z",
  recordCount: 42,
  ciphertextBytes: 4096,
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
};

describe("the chunk create body", () => {
  test("accepts a well-formed chunk and coerces the timestamps to dates", () => {
    const parsed = AgentVaultSessionLogChunkCreateSchema.parse(validChunk);
    expect(parsed.startedAt).toBeInstanceOf(Date);
    expect(parsed.endedAt.toISOString()).toBe("2026-09-16T10:31:00.000Z");
  });

  test.each([
    { field: "chunkId", value: "not-a-uuid", why: "a chunk id has to be a UUIDv7 so it sorts by time" },
    { field: "chunkId", value: "3f2b8c1e-9d4a-4e6b-a1c7-5f0e2d9b8a64", why: "a v4 UUID does not sort by time" },
    {
      field: "chunkId",
      value: "01A0A9C5-231D-7ABC-8DEF-0123456789AB",
      why: "the browser rebuilds the AAD from the lowercase id in the object name"
    },
    { field: "recordCount", value: 0, why: "an empty chunk is never worth uploading" },
    { field: "recordCount", value: AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS + 1, why: "over the slice size" },
    { field: "recordCount", value: 1.5, why: "not an integer" },
    {
      field: "ciphertextBytes",
      value: AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES - 1,
      why: "smaller than an IV, '[]' and a tag"
    },
    { field: "ciphertextBytes", value: AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES + 1, why: "over the size ceiling" },
    {
      field: "ciphertextSha256",
      value: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
      why: "padded base64 is the wrong width"
    },
    {
      field: "ciphertextSha256",
      value: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuF",
      why: "42 characters is not 32 bytes"
    },
    {
      field: "ciphertextSha256",
      value: "47DEQpj8HBSa-/TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
      why: "url-safe base64 is a different alphabet"
    },
    { field: "ciphertextSha256", value: undefined, why: "every chunk carries its digest" }
  ])("rejects $field: $why", ({ field, value }) => {
    expect(AgentVaultSessionLogChunkCreateSchema.safeParse({ ...validChunk, [field]: value }).success).toBe(false);
  });

  test("rejects a body carrying anything the contract does not name", () => {
    const parsed = AgentVaultSessionLogChunkCreateSchema.parse({ ...validChunk, objectKey: "attacker/controlled" });
    expect(parsed).not.toHaveProperty("objectKey");
  });
});

describe("the session logs history query", () => {
  test("starts from the newest logs when no cursor is given", () => {
    expect(AgentVaultSessionLogHistoryQuerySchema.parse({})).toEqual({ cursor: undefined });
  });

  test("reads a cursor back as the name to continue after", () => {
    const after = "8208694117999_01a11226-9990-7a3f-8c21-4e6f9b2d1a07.e91f3c20-7d4b-4a8e-9f1c-3b5d7e2a6c48.json.enc";
    expect(AgentVaultSessionLogHistoryQuerySchema.parse({ cursor: encodeHistoryCursor(after) }).cursor).toBe(after);
  });

  test.each([
    "yesterday",
    Buffer.from('{"v":1,"m":"h","id":"01a0a9c5-231d-7abc-8def-0123456789ab"}').toString("base64url"),
    Buffer.from('{"v":2,"m":"h","after":""}').toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, m: "h", after: "x".repeat(1025) })).toString("base64url")
  ])("rejects a cursor it did not issue: %s", (cursor) => {
    expect(AgentVaultSessionLogHistoryQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  test("says where a tail cursor belongs", () => {
    const result = AgentVaultSessionLogHistoryQuerySchema.safeParse({ cursor: encodeTailCursor("1791278402731-0") });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/session logs tail endpoint/);
  });
});

describe("the session logs tail query", () => {
  test("starts from the most recent chunks when no cursor is given", () => {
    expect(AgentVaultSessionLogTailQuerySchema.parse({})).toEqual({ cursor: undefined });
  });

  test("reads a cursor back as the feed entry to continue after", () => {
    expect(AgentVaultSessionLogTailQuerySchema.parse({ cursor: encodeTailCursor("1791278402731-3") }).cursor).toBe(
      "1791278402731-3"
    );
  });

  test.each([
    "yesterday",
    Buffer.from('{"v":1,"m":"t","at":"2026-09-25T10:00:00.123Z"}').toString("base64url"),
    Buffer.from('{"v":2,"m":"t","id":"1791278402731"}').toString("base64url"),
    Buffer.from('{"v":2,"m":"t","id":"99999999999999999-0"}').toString("base64url")
  ])("rejects a cursor it did not issue: %s", (cursor) => {
    expect(AgentVaultSessionLogTailQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  test("says where a history cursor belongs", () => {
    const result = AgentVaultSessionLogTailQuerySchema.safeParse({
      cursor: encodeHistoryCursor("8208694117999_01a11226-9990-7a3f-8c21-4e6f9b2d1a07")
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/session logs endpoint instead/);
  });
});

describe("the settings patch", () => {
  test("every field is optional, so an empty patch is valid", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.parse({})).toEqual({});
  });

  test("accepts null for the connection, which detaches it", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.parse({ appConnectionId: null }).appConnectionId).toBeNull();
  });

  test.each([
    { value: "..", why: "the whole prefix is a traversal" },
    { value: "logs/../../etc", why: "a traversal segment in the middle" },
    { value: "logs/../secrets", why: "climbing out of the prefix" },
    { value: ".", why: "the whole prefix is a current-folder reference" },
    { value: "./logs", why: "a leading '.' folder, which browsers drop from the download link" },
    { value: "logs/./agent-vault", why: "a '.' folder in the middle" },
    { value: "logs/.", why: "a trailing '.' folder" },
    { value: "/logs", why: "a slash at the start" },
    { value: "logs/", why: "a slash at the end" },
    { value: "logs//agent-vault", why: "an empty folder between two slashes" },
    { value: "/", why: "only a slash" },
    { value: "logs/\u0000", why: "a control character" },
    { value: "team*", why: "an asterisk, which is a wildcard in the suggested IAM policy" },
    { value: "a".repeat(513), why: "longer than 512 characters" }
  ])("rejects a key prefix: $why", ({ value }) => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ keyPrefix: value }).success).toBe(false);
  });

  test.each(["logs", "logs/agent-vault", "a.b-c_d", "", ".hidden/logs", "logs/...", "logs.v2"])(
    "accepts the key prefix %s",
    (keyPrefix) => {
      expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ keyPrefix }).success).toBe(true);
    }
  );

  test("accepts a key prefix of exactly 512 characters", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ keyPrefix: "a".repeat(512) }).success).toBe(true);
  });

  test("rejects a region that is not an AWS region", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ region: "moon-base-1" }).success).toBe(false);
  });

  test.each([
    { value: "ab", why: "shorter than 3 characters" },
    { value: "a".repeat(64), why: "longer than 63 characters" },
    { value: "My-Bucket", why: "uppercase letters" },
    { value: "my_bucket", why: "an underscore" },
    { value: "-bucket", why: "a leading hyphen" },
    { value: "bucket.", why: "a trailing dot" }
  ])("rejects a bucket name with $why", ({ value }) => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ bucket: value }).success).toBe(false);
  });

  test.each(["session-logs-bucket", "a.b-c", "a".repeat(63)])("accepts the bucket name %s", (bucket) => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ bucket }).success).toBe(true);
  });
});
