import { describe, expect, test } from "vitest";

import {
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS,
  AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES
} from "./agent-vault-session-log-constants";
import { encodeHistoryCursor, encodeTailCursor } from "./agent-vault-session-log-cursor";
import {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogHistoryQuerySchema,
  AgentVaultSessionLogSettingsUpdateSchema,
  AgentVaultSessionLogTailQuerySchema
} from "./agent-vault-session-log-schemas";

const validChunk = {
  chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ",
  startedAt: "2026-09-16T10:30:00.000Z",
  endedAt: "2026-09-16T10:31:00.000Z",
  firstSeq: 0,
  lastSeq: 41,
  recordCount: 42,
  droppedCount: 0,
  ciphertextBytes: 4096,
  iv: "qrvM3e7/ABEiM0RV",
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
};

describe("the chunk create body", () => {
  test("accepts a well-formed chunk and coerces the timestamps to dates", () => {
    const parsed = AgentVaultSessionLogChunkCreateSchema.parse(validChunk);
    expect(parsed.startedAt).toBeInstanceOf(Date);
    expect(parsed.endedAt.toISOString()).toBe("2026-09-16T10:31:00.000Z");
  });

  test.each([
    { field: "chunkId", value: "not-a-ulid", why: "a chunk id has to be a ULID so it sorts by time" },
    { field: "chunkId", value: "01K5ABCDEFGHJKMNPQRSTVWXY", why: "a ULID is exactly 26 characters" },
    { field: "recordCount", value: 0, why: "an empty chunk is never worth a row" },
    { field: "recordCount", value: AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS + 1, why: "over the slice size" },
    { field: "recordCount", value: 1.5, why: "not an integer" },
    { field: "droppedCount", value: -1, why: "negative" },
    { field: "firstSeq", value: -1, why: "sequence numbers start at zero" },
    { field: "lastSeq", value: Number.MAX_SAFE_INTEGER + 2, why: "past what reads back from bigint exactly" },
    { field: "droppedCount", value: 1e19, why: "past what the bigint column holds" },
    {
      field: "ciphertextBytes",
      value: AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES - 1,
      why: "smaller than '[]' plus a tag"
    },
    { field: "ciphertextBytes", value: AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES + 1, why: "over the size ceiling" },
    { field: "iv", value: "qrvM3e7/ABEiM0RV=", why: "padded base64 is the wrong width" },
    { field: "iv", value: "qrvM3e7/ABEiM0R", why: "15 characters is not 12 bytes" },
    { field: "iv", value: "qrvM3e7-ABEiM0RV", why: "url-safe base64 is a different alphabet" },
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
  test("defaults to 1000 records and no cursor", () => {
    expect(AgentVaultSessionLogHistoryQuerySchema.parse({})).toEqual({ limit: 1000, cursor: undefined });
  });

  test("coerces a querystring limit, which always arrives as a string", () => {
    expect(AgentVaultSessionLogHistoryQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  test.each([0, 5001, -1])("rejects a limit of %s", (limit) => {
    expect(AgentVaultSessionLogHistoryQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  test("reads a cursor back as the chunk to page before", () => {
    const cursor = encodeHistoryCursor("01K5ABCDEFGHJKMNPQRSTVWXYZ");
    expect(AgentVaultSessionLogHistoryQuerySchema.parse({ cursor }).cursor).toBe("01K5ABCDEFGHJKMNPQRSTVWXYZ");
  });

  test.each(["yesterday", Buffer.from('{"v":1,"m":"h","id":"not-a-ulid"}').toString("base64url")])(
    "rejects a cursor it did not issue: %s",
    (cursor) => {
      expect(AgentVaultSessionLogHistoryQuerySchema.safeParse({ cursor }).success).toBe(false);
    }
  );

  test("says where a tail cursor belongs", () => {
    const result = AgentVaultSessionLogHistoryQuerySchema.safeParse({ cursor: encodeTailCursor(new Date()) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/session logs tail endpoint/);
  });
});

describe("the session logs tail query", () => {
  test("starts from now when no cursor is given", () => {
    expect(AgentVaultSessionLogTailQuerySchema.parse({})).toEqual({ limit: 1000, cursor: undefined });
  });

  test("reads a cursor back as the time to continue from", () => {
    const at = new Date("2026-09-25T10:00:00.123Z");
    expect(AgentVaultSessionLogTailQuerySchema.parse({ cursor: encodeTailCursor(at) }).cursor).toEqual(at);
  });

  test.each(["yesterday", Buffer.from('{"v":1,"m":"t","at":"soon"}').toString("base64url")])(
    "rejects a cursor it did not issue: %s",
    (cursor) => {
      expect(AgentVaultSessionLogTailQuerySchema.safeParse({ cursor }).success).toBe(false);
    }
  );

  test("says where a history cursor belongs", () => {
    const result = AgentVaultSessionLogTailQuerySchema.safeParse({
      cursor: encodeHistoryCursor("01K5ABCDEFGHJKMNPQRSTVWXYZ")
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
