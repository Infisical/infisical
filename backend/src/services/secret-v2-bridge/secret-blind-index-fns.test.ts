import { describe, expect, it } from "vitest";

import { buildSecretBlindIndexer } from "./secret-blind-index-fns";

const fakeCipher = (scope: string) => ({
  generateSecretBlindIndex: async (value: Buffer) => `${scope}:${value.toString()}`
});

const makeIndexer = () => buildSecretBlindIndexer(fakeCipher("project") as never, fakeCipher("org") as never);

describe("buildSecretBlindIndexer", () => {
  it("derives the project index from the project data key and the org index from the org data key", async () => {
    const indexer = makeIndexer();

    await expect(indexer.generateBlindIndexes(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: "org:hunter2"
    });
  });

  it("gives the same value a different digest at each scope", async () => {
    const indexer = makeIndexer();

    const projectIndex = await indexer.generateProjectLevelBlindIndex(Buffer.from("hunter2"));
    const orgIndex = await indexer.generateOrgLevelBlindIndex(Buffer.from("hunter2"));

    expect(projectIndex).not.toBe(orgIndex);
  });

  it("gives the same value the same digest every time, so two secrets sharing a value match", async () => {
    const indexer = makeIndexer();

    const first = await indexer.generateOrgLevelBlindIndex(Buffer.from("shared"));
    const second = await indexer.generateOrgLevelBlindIndex(Buffer.from("shared"));

    expect(first).toBe(second);
  });

  it("gives different values different digests", async () => {
    const indexer = makeIndexer();

    const first = await indexer.generateOrgLevelBlindIndex(Buffer.from("one"));
    const second = await indexer.generateOrgLevelBlindIndex(Buffer.from("two"));

    expect(first).not.toBe(second);
  });
});
