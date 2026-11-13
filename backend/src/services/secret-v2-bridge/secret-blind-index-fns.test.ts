import { describe, expect, it, vi } from "vitest";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";

import { createSecretBlindIndexer } from "./secret-blind-index-fns";

const ORG_ID = "9d2c1f4b-1f4b-4d2c-9f4b-1f4b4d2c9f4b";

const fakeCipher = (scope: string) => ({
  generateSecretBlindIndex: async (value: Buffer) => `${scope}:${value.toString()}`
});

const makeDataKeyService = () => ({
  createCipherPairWithDataKey: vi.fn(async (ctx: { type: KmsDataKey }) =>
    fakeCipher(ctx.type === KmsDataKey.Organization ? "org" : "project")
  )
});

const makeIndexer = (dataKeyService = makeDataKeyService()) =>
  createSecretBlindIndexer({
    projectCipher: fakeCipher("project") as never,
    orgId: ORG_ID,
    dataKeyService: dataKeyService as never
  });

describe("createSecretBlindIndexer", () => {
  it("derives the project index from the project data key and the org index from the org data key", async () => {
    const indexer = await makeIndexer();

    await expect(indexer.generateBlindIndexes(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: "org:hunter2"
    });
  });

  it("gives the same value a different digest at each scope", async () => {
    const indexer = await makeIndexer();

    const projectIndex = await indexer.generateProjectLevelBlindIndex(Buffer.from("hunter2"));
    const orgIndex = await indexer.generateOrgLevelBlindIndex(Buffer.from("hunter2"));

    expect(projectIndex).not.toBe(orgIndex);
  });

  it("gives the same value the same digest every time, so two secrets sharing a value match", async () => {
    const indexer = await makeIndexer();

    const first = await indexer.generateOrgLevelBlindIndex(Buffer.from("shared"));
    const second = await indexer.generateOrgLevelBlindIndex(Buffer.from("shared"));

    expect(first).toBe(second);
  });

  it("gives different values different digests", async () => {
    const indexer = await makeIndexer();

    const first = await indexer.generateOrgLevelBlindIndex(Buffer.from("one"));
    const second = await indexer.generateOrgLevelBlindIndex(Buffer.from("two"));

    expect(first).not.toBe(second);
  });

  // A bulk write can carry thousands of values, and each data key resolution can be a round trip to an
  // external KMS, so the pairs are built once for the request rather than once per value.
  it("resolves only the org data key, once, no matter how many values it indexes", async () => {
    const dataKeyService = makeDataKeyService();
    const indexer = await makeIndexer(dataKeyService);

    await Promise.all(["a", "b", "c", "d"].map((value) => indexer.generateBlindIndexes(Buffer.from(value))));

    expect(dataKeyService.createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
    expect(dataKeyService.createCipherPairWithDataKey).toHaveBeenCalledWith({
      type: KmsDataKey.Organization,
      orgId: ORG_ID
    });
  });
});
