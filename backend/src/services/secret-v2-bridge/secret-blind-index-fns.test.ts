import { describe, expect, it, vi } from "vitest";

import { KmsDataKey } from "@app/services/kms/kms-types";

import { createSecretBlindIndexer } from "./secret-blind-index-fns";

const PROJECT_ID = "6c1b0e3a-0e3a-4c1b-8e3a-0e3a4c1b8e3a";
const ORG_ID = "9d2c1f4b-1f4b-4d2c-9f4b-1f4b4d2c9f4b";

const makeKmsService = () => ({
  createCipherPairWithDataKey: vi.fn(async (ctx: { type: KmsDataKey }) => ({
    generateSecretBlindIndex: async (value: Buffer) =>
      `${ctx.type === KmsDataKey.Organization ? "org" : "project"}:${value.toString()}`
  }))
});

const makeIndexer = (kmsService = makeKmsService()) =>
  createSecretBlindIndexer({ projectId: PROJECT_ID, orgId: ORG_ID, kmsService: kmsService as never });

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
  it("resolves each data key once no matter how many values it indexes", async () => {
    const kmsService = makeKmsService();
    const indexer = await makeIndexer(kmsService);

    await Promise.all(["a", "b", "c", "d"].map((value) => indexer.generateBlindIndexes(Buffer.from(value))));

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(2);
  });

  it("threads the transaction into both key resolutions", async () => {
    const kmsService = makeKmsService();
    const tx = { marker: "tx" };

    await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      tx: tx as never
    });

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith(expect.anything(), tx);
    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(2);
  });
});
