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

const makeOrgDAL = (secretValueOrgBlindIndexEnabled: boolean) => ({
  findById: vi.fn(async () => ({ id: ORG_ID, secretValueOrgBlindIndexEnabled }))
});

describe("createSecretBlindIndexer", () => {
  it("returns both digests when the org has the index enabled", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generate(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: "org:hunter2"
    });
  });

  it("returns a null org digest when the org has opted out", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(false) as never
    });

    await expect(indexer.generate(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: null
    });
  });

  it("does not resolve the org data key at all when the org has opted out", async () => {
    const kmsService = makeKmsService();

    await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: makeOrgDAL(false) as never
    });

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: KmsDataKey.Organization }),
      expect.anything()
    );
  });

  it("builds each cipher pair once no matter how many values it indexes", async () => {
    const kmsService = makeKmsService();
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await Promise.all(["a", "b", "c", "d"].map((value) => indexer.generate(Buffer.from(value))));

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(2);
  });

  it("returns null for a secret with no value rather than hashing an empty buffer", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generateOptional(undefined)).resolves.toBeNull();
    await expect(indexer.generateOptional(null)).resolves.toBeNull();
  });

  // The call sites this replaced all gated on truthiness (`el.secretValue ? generate(...) : null`),
  // and encryptedValue is still gated that way, so an empty value must produce no digest. Hashing it
  // would collide every empty secret in the org on one digest and leave a row with a digest but no
  // encrypted value.
  it("treats an empty value as no value", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generateOptional("")).resolves.toBeNull();
  });

  it("threads the transaction into both the org lookup and the key resolution", async () => {
    const kmsService = makeKmsService();
    const orgDAL = makeOrgDAL(true);
    const tx = { marker: "tx" };

    await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: orgDAL as never,
      tx: tx as never
    });

    expect(orgDAL.findById).toHaveBeenCalledWith(ORG_ID, tx);
    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith(expect.anything(), tx);
  });
});
