import { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

import { KmsDataKey, ReadFrom } from "@app/domains/platform/kms-core/ce/module";

import { prepareSecretWriteCiphers } from "./secret-write-cipher-fns";

const TX = { isTransaction: true, executionPromise: Promise.resolve() } as unknown as Knex;
const PROJECT_ID = "6c1b0e3a-0e3a-4c1b-8e3a-0e3a4c1b8e3a";
const ORG_ID = "9d2c1f4b-1f4b-4d2c-9f4b-1f4b4d2c9f4b";

const makeDataKeyService = () => ({
  createCipherPairWithDataKey: vi.fn(async (ctx: { type: KmsDataKey }) => ({
    generateSecretBlindIndex: async (value: Buffer) =>
      `${ctx.type === KmsDataKey.Organization ? "org" : "project"}:${value.toString()}`
  }))
});

describe("prepareSecretWriteCiphers", () => {
  // Each resolution of the project pair is a few queries and, for a project on an external KMS, a provider call.
  it("should resolve the project data key once and reuse it for the blind indexer", async () => {
    // Setup
    const kmsDataKeyService = makeDataKeyService();

    // Action
    const ciphers = await prepareSecretWriteCiphers({
      kmsDataKeyService: kmsDataKeyService as never,
      projectId: PROJECT_ID,
      orgId: ORG_ID
    });

    // Assert
    const projectCalls = kmsDataKeyService.createCipherPairWithDataKey.mock.calls.filter(
      ([ctx]) => ctx.type === KmsDataKey.SecretManager
    );
    expect(projectCalls).toHaveLength(1);
    await expect(ciphers.blindIndexer.generateBlindIndexes(Buffer.from("v"))).resolves.toEqual({
      secretValueBlindIndex: "project:v",
      secretValueOrgBlindIndex: "org:v"
    });
  });

  it("should pass the caller's read options to KMS Core", async () => {
    // Setup
    const kmsDataKeyService = makeDataKeyService();
    const readOptions = { readFrom: ReadFrom.Primary };

    // Action
    await prepareSecretWriteCiphers({
      kmsDataKeyService: kmsDataKeyService as never,
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      readOptions
    });

    // Assert
    expect(kmsDataKeyService.createCipherPairWithDataKey).toHaveBeenCalledWith(
      { type: KmsDataKey.SecretManager, projectId: PROJECT_ID },
      readOptions
    );
  });

  it("should fetch both ciphers on the caller's transaction instead of the connection pool", async () => {
    // Setup
    const kmsDataKeyService = makeDataKeyService();
    const joined = makeDataKeyService();
    const within = vi.fn(() => joined);

    // Action
    const ciphers = await prepareSecretWriteCiphers({
      kmsDataKeyService: { ...kmsDataKeyService, within } as never,
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      tx: TX
    });

    // Assert
    expect(within).toHaveBeenCalledTimes(1);
    expect(joined.createCipherPairWithDataKey).toHaveBeenCalledTimes(2);
    expect(kmsDataKeyService.createCipherPairWithDataKey).not.toHaveBeenCalled();
    await expect(ciphers.blindIndexer.generateBlindIndexes(Buffer.from("v"))).resolves.toEqual({
      secretValueBlindIndex: "project:v",
      secretValueOrgBlindIndex: "org:v"
    });
  });
});
