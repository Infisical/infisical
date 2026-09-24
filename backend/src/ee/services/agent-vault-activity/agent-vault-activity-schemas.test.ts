import { describe, expect, test } from "vitest";

import {
  AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES,
  AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS,
  AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES
} from "./agent-vault-activity-constants";
import {
  AgentVaultActivityChunkCreateSchema,
  AgentVaultActivityConfigUpdateSchema,
  AgentVaultActivityQuerySchema
} from "./agent-vault-activity-schemas";

const validChunk = {
  chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ",
  startedAt: "2026-09-16T10:30:00.000Z",
  endedAt: "2026-09-16T10:31:00.000Z",
  firstSeq: 0,
  lastSeq: 41,
  recordCount: 42,
  droppedCount: 0,
  ciphertextBytes: 4096,
  iv: "qrvM3e7/ABEiM0RV"
};

describe("the chunk create body", () => {
  test("accepts a well-formed chunk and coerces the timestamps to dates", () => {
    const parsed = AgentVaultActivityChunkCreateSchema.parse(validChunk);
    expect(parsed.startedAt).toBeInstanceOf(Date);
    expect(parsed.endedAt.toISOString()).toBe("2026-09-16T10:31:00.000Z");
  });

  test.each([
    { field: "chunkId", value: "not-a-ulid", why: "a chunk id has to be a ULID so it sorts by time" },
    { field: "chunkId", value: "01K5ABCDEFGHJKMNPQRSTVWXY", why: "a ULID is exactly 26 characters" },
    { field: "recordCount", value: 0, why: "an empty chunk is never worth a row" },
    { field: "recordCount", value: AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS + 1, why: "over the slice size" },
    { field: "recordCount", value: 1.5, why: "not an integer" },
    { field: "droppedCount", value: -1, why: "negative" },
    { field: "firstSeq", value: -1, why: "sequence numbers start at zero" },
    { field: "lastSeq", value: Number.MAX_SAFE_INTEGER + 2, why: "past what reads back from bigint exactly" },
    { field: "droppedCount", value: 1e19, why: "past what the bigint column holds" },
    { field: "ciphertextBytes", value: AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES - 1, why: "smaller than '[]' plus a tag" },
    { field: "ciphertextBytes", value: AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES + 1, why: "over the size ceiling" },
    { field: "iv", value: "qrvM3e7/ABEiM0RV=", why: "padded base64 is the wrong width" },
    { field: "iv", value: "qrvM3e7/ABEiM0R", why: "15 characters is not 12 bytes" },
    { field: "iv", value: "qrvM3e7-ABEiM0RV", why: "url-safe base64 is a different alphabet" }
  ])("rejects $field: $why", ({ field, value }) => {
    expect(AgentVaultActivityChunkCreateSchema.safeParse({ ...validChunk, [field]: value }).success).toBe(false);
  });

  test("rejects a body carrying anything the contract does not name", () => {
    const parsed = AgentVaultActivityChunkCreateSchema.parse({ ...validChunk, objectKey: "attacker/controlled" });
    expect(parsed).not.toHaveProperty("objectKey");
  });
});

describe("the activity page query", () => {
  test("defaults to 1000 records and no cursor", () => {
    expect(AgentVaultActivityQuerySchema.parse({})).toEqual({ limit: 1000, before: undefined });
  });

  test("coerces a querystring limit, which always arrives as a string", () => {
    expect(AgentVaultActivityQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  test.each([0, 5001, -1])("rejects a limit of %s", (limit) => {
    expect(AgentVaultActivityQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  test("rejects a cursor that is not a chunk id", () => {
    expect(AgentVaultActivityQuerySchema.safeParse({ before: "yesterday" }).success).toBe(false);
  });
});

describe("the settings patch", () => {
  test("every field is optional, so an empty patch is valid", () => {
    expect(AgentVaultActivityConfigUpdateSchema.parse({})).toEqual({});
  });

  test("accepts null for the connection, which detaches it", () => {
    expect(AgentVaultActivityConfigUpdateSchema.parse({ appConnectionId: null }).appConnectionId).toBeNull();
  });

  test.each([
    { value: "..", why: "the whole prefix is a traversal" },
    { value: "logs/../../etc", why: "a traversal segment in the middle" },
    { value: "logs/../secrets", why: "climbing out of the prefix" },
    { value: "logs/\u0000", why: "a control character" },
    { value: `a${"b".repeat(512)}`, why: "longer than the column" }
  ])("rejects a key prefix: $why", ({ value }) => {
    expect(AgentVaultActivityConfigUpdateSchema.safeParse({ keyPrefix: value }).success).toBe(false);
  });

  test.each(["logs", "logs/agent-vault", "a.b-c_d", ""])("accepts the key prefix %s", (keyPrefix) => {
    expect(AgentVaultActivityConfigUpdateSchema.safeParse({ keyPrefix }).success).toBe(true);
  });

  test.each([
    { value: "a".repeat(511), fits: true, why: "511 characters, 512 once the slash is added" },
    { value: `${"a".repeat(511)}/`, fits: true, why: "512 characters that already end in the slash" },
    { value: `/${"a".repeat(511)}/`, fits: true, why: "a leading slash, which is dropped" },
    { value: "a".repeat(512), fits: false, why: "512 characters, 513 once the slash is added" }
  ])("a key prefix of $why is accepted: $fits", ({ value, fits }) => {
    expect(AgentVaultActivityConfigUpdateSchema.safeParse({ keyPrefix: value }).success).toBe(fits);
  });

  test("rejects a region that is not an AWS region", () => {
    expect(AgentVaultActivityConfigUpdateSchema.safeParse({ region: "moon-base-1" }).success).toBe(false);
  });

  test("rejects a bucket name that could not be one", () => {
    expect(AgentVaultActivityConfigUpdateSchema.safeParse({ bucket: "ab" }).success).toBe(false);
  });
});
