import { describe, expect, test } from "vitest";

import {
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES,
  AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES
} from "./agent-vault-session-log-constants";
import { encodeHistoryCursor, encodeTailCursor } from "./agent-vault-session-log-cursor-fns";
import {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogHistoryQuerySchema,
  AgentVaultSessionLogSettingsUpdateSchema,
  AgentVaultSessionLogTailQuerySchema
} from "./agent-vault-session-log-schemas";

const validChunk = {
  chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab",
  endedAt: "2026-09-16T10:31:00.000Z",
  ciphertextBytes: 4096,
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
};

describe("the chunk create body", () => {
  test("accepts a well-formed chunk and coerces the timestamp to a date", () => {
    const parsed = AgentVaultSessionLogChunkCreateSchema.parse(validChunk);
    expect(parsed.endedAt).toBeInstanceOf(Date);
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

  test("drops a field the contract does not name, so a caller can't choose the object key", () => {
    const parsed = AgentVaultSessionLogChunkCreateSchema.parse({ ...validChunk, objectKey: "attacker/controlled" });
    expect(parsed).not.toHaveProperty("objectKey");
  });
});

describe("the session logs history query", () => {
  test("accepts a history query with no cursor", () => {
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
  test("accepts a tail query with no cursor", () => {
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
  const external = {
    type: "external",
    appConnectionId: "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11",
    bucket: "session-logs-bucket",
    region: "us-east-1"
  };
  const withStorage = (storage: Record<string, unknown>) =>
    AgentVaultSessionLogSettingsUpdateSchema.safeParse({ enabled: true, storage });
  const withExternal = (fields: Record<string, unknown>) => withStorage({ ...external, ...fields });

  test("is either turning off, or turning on with a storage", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(withStorage({ type: "default" }).success).toBe(true);
  });

  test.each([
    { body: {}, why: "an empty body" },
    { body: { enabled: true }, why: "turning on without a storage" },
    { body: { storage: { type: "default" } }, why: "a storage without enabled" },
    { body: { enabled: false, storage: { type: "default" } }, why: "turning off with a storage" }
  ])("rejects $why", ({ body }) => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse(body).success).toBe(false);
  });

  test("accepts each storage shape", () => {
    expect(withStorage({ type: "default" }).success).toBe(true);
    expect(withStorage(external).success).toBe(true);
    expect(withExternal({ keyPrefix: "logs" }).success).toBe(true);
  });

  test.each([
    { storage: { type: "default", bucket: "session-logs-bucket" }, why: "default storage with a bucket" },
    { storage: { ...external, type: "default" }, why: "default storage with every external field" },
    { storage: { type: "external" }, why: "external storage with no bucket" },
    { storage: { ...external, appConnectionId: undefined }, why: "external storage with no connection" },
    { storage: { ...external, appConnectionId: null }, why: "external storage with a null connection" },
    { storage: { type: "instance" }, why: "a storage type that doesn't exist" }
  ])("rejects $why", ({ storage }) => {
    expect(withStorage(storage).success).toBe(false);
  });

  test("rejects the flat fields of the old body", () => {
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ bucket: "session-logs-bucket" }).success).toBe(false);
    expect(AgentVaultSessionLogSettingsUpdateSchema.safeParse({ appConnectionId: null }).success).toBe(false);
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
    { value: "a".repeat(257), why: "longer than 256 characters" }
  ])("rejects a key prefix: $why", ({ value }) => {
    expect(withExternal({ keyPrefix: value }).success).toBe(false);
  });

  test.each(["logs", "logs/agent-vault", "a.b-c_d", "", ".hidden/logs", "logs/...", "logs.v2"])(
    "accepts the key prefix %s",
    (keyPrefix) => {
      expect(withExternal({ keyPrefix }).success).toBe(true);
    }
  );

  test("accepts a key prefix of exactly 256 characters", () => {
    expect(withExternal({ keyPrefix: "a".repeat(256) }).success).toBe(true);
  });

  test("rejects a region that is not an AWS region", () => {
    expect(withExternal({ region: "moon-base-1" }).success).toBe(false);
  });

  test.each([
    { value: "ab", why: "shorter than 3 characters" },
    { value: "a".repeat(64), why: "longer than 63 characters" },
    { value: "My-Bucket", why: "uppercase letters" },
    { value: "my_bucket", why: "an underscore" },
    { value: "-bucket", why: "a leading hyphen" },
    { value: "bucket.", why: "a trailing dot" }
  ])("rejects a bucket name with $why", ({ value }) => {
    expect(withExternal({ bucket: value }).success).toBe(false);
  });

  test.each(["session-logs-bucket", "a.b-c", "a".repeat(63)])("accepts the bucket name %s", (bucket) => {
    expect(withExternal({ bucket }).success).toBe(true);
  });
});
