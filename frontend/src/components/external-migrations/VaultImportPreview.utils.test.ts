import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildVaultImportPreview } from "./VaultImportPreview.utils";

const folderNames = (rows: { kind: string; name: string }[]) =>
  rows.filter((row) => row.kind === "folder").map((row) => row.name);

describe("Vault import preview", () => {
  it("drops the secrets engine and mirrors the remaining path", () => {
    const { rows, invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["kv/prod/db"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(folderNames(rows), ["/newww", "prod/", "db/"]);
    assert.deepEqual(invalidPaths, []);
  });

  it("creates a shared parent only once for sibling paths", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/new-path", "kv/new-path/api"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(folderNames(rows), ["/newww", "new-path/", "api/"]);
  });

  it("nests each path under its own parent and sorts siblings", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/teste/belinha", "kv/prod/db"],
      destinationPath: "/",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(folderNames(rows), ["/", "prod/", "db/", "teste/", "belinha/"]);
  });

  it("hangs placeholder secrets off the folder the path maps to", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/new-path", "kv/new-path/api"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(
      rows
        .filter((row) => row.kind === "secret")
        .map((row) => ({ name: row.name, depth: row.depth, source: row.source })),
      [
        { name: "secret_1", depth: 2, source: "kv/new-path" },
        { name: "secret_2", depth: 2, source: "kv/new-path" },
        { name: "secret_1", depth: 3, source: "kv/new-path/api" },
        { name: "secret_2", depth: 3, source: "kv/new-path/api" }
      ]
    );
  });

  it("flattens every path into the destination when the structure is not preserved", () => {
    const { rows, headline, invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["kv/prod/db", "kv/teste"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: false
    });

    assert.deepEqual(folderNames(rows), ["/newww"]);
    assert.ok(rows.slice(1).every((row) => row.depth === 1));
    assert.equal(
      headline,
      "All secrets are flattened into /newww. Vault path structure is not preserved."
    );
    assert.deepEqual(invalidPaths, []);
  });

  it("never repeats a placeholder name when flattening, since duplicates fail on import", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/prod/db", "kv/teste", "kv/new-path"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: false
    });

    const names = rows.filter((row) => row.kind === "secret").map((row) => row.name);

    assert.deepEqual(names, [
      "secret_1",
      "secret_2",
      "secret_3",
      "secret_4",
      "secret_5",
      "secret_6"
    ]);
    assert.equal(new Set(names).size, names.length);
  });

  it("restarts placeholder numbering per folder when the structure is preserved", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/prod/db", "kv/teste"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(
      rows.filter((row) => row.kind === "secret").map((row) => row.name),
      ["secret_1", "secret_2", "secret_1", "secret_2"]
    );
  });

  it("matches the headline verb to the number of source paths", () => {
    const onePath = buildVaultImportPreview({
      selectedPaths: ["kv/prod/db"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });
    const manyPaths = buildVaultImportPreview({
      selectedPaths: ["kv/prod", "kv/teste"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.equal(onePath.headline, "The Vault path becomes 2 folders under /newww.");
    assert.equal(manyPaths.headline, "The Vault paths become 2 folders under /newww.");
  });

  it("counts only the paths that reached the tree when picking the headline verb", () => {
    const { headline } = buildVaultImportPreview({
      selectedPaths: ["kv/prod", "kv/my.app"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.equal(headline, "The Vault path becomes 1 folder under /newww.");
  });

  it("elides the middle of a deep destination path", () => {
    const { rows, headline } = buildVaultImportPreview({
      selectedPaths: ["kv/prod"],
      destinationPath: "/one/two/three/four/five",
      mountPath: "kv",
      keepVaultStructure: false
    });

    assert.equal(rows[0].name, "/one/.../five");
    assert.equal(
      headline,
      "All secrets are flattened into /one/.../five. Vault path structure is not preserved."
    );
  });

  it("keeps a destination path short enough to read intact", () => {
    const { rows } = buildVaultImportPreview({
      selectedPaths: ["kv/prod"],
      destinationPath: "/one/two/three",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.equal(rows[0].name, "/one/two/three");
  });

  it("rejects paths that hold only a mount", () => {
    const { rows, invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["kv", "kv/prod"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(invalidPaths, ["kv"]);
    assert.deepEqual(folderNames(rows), ["/newww", "prod/"]);
  });

  it("rejects segments that cannot become folder names", () => {
    const { invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["kv/my.app", "kv/my app", "kv/my-app_1"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: true
    });

    assert.deepEqual(invalidPaths, ["kv/my.app", "kv/my app"]);
  });

  it("keeps invalid paths out of the flattened preview", () => {
    const { invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["kv/my.app"],
      destinationPath: "/newww",
      mountPath: "kv",
      keepVaultStructure: false
    });

    assert.deepEqual(invalidPaths, []);
  });
  it("drops every segment of a nested secrets engine", () => {
    const { rows, invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["apps/kv/prod/db"],
      destinationPath: "/newww",
      mountPath: "apps/kv",
      keepVaultStructure: true
    });

    assert.deepEqual(folderNames(rows), ["/newww", "prod/", "db/"]);
    assert.deepEqual(invalidPaths, []);
  });

  it("rejects paths from a sibling nested secrets engine", () => {
    const { rows, invalidPaths } = buildVaultImportPreview({
      selectedPaths: ["apps/kv1/db", "apps/kv2/db"],
      destinationPath: "/newww",
      mountPath: "apps/kv1",
      keepVaultStructure: true
    });

    assert.deepEqual(invalidPaths, ["apps/kv2/db"]);
    assert.deepEqual(folderNames(rows), ["/newww", "db/"]);
  });
});
