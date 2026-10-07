import { describe, expect, test } from "vitest";

import {
  getSecretSyncsDuplicatedByCopies,
  getSecretSyncsNewlyCoveringPaths,
  isPathCoveredBySecretSync
} from "./secretSyncCoverage";

describe("isPathCoveredBySecretSync", () => {
  const sync = (path: string, includeAllSubFolders?: boolean, environment = "dev") => ({
    environment: { slug: environment },
    folder: { path },
    syncOptions: includeAllSubFolders === undefined ? {} : { includeAllSubFolders }
  });

  const covers = (entry: ReturnType<typeof sync>, secretPath: string, environment = "dev") =>
    isPathCoveredBySecretSync(entry, { environment, secretPath });

  test("covers its own path whether or not it includes subfolders", () => {
    expect(covers(sync("/apps", false), "/apps")).toBe(true);
    expect(covers(sync("/apps", true), "/apps")).toBe(true);
    expect(covers(sync("/apps"), "/apps")).toBe(true);
  });

  test("covers a descendant path only when it includes subfolders", () => {
    expect(covers(sync("/apps", true), "/apps/payments/new")).toBe(true);
    expect(covers(sync("/apps", false), "/apps/payments")).toBe(false);
    expect(covers(sync("/apps"), "/apps/payments")).toBe(false);
  });

  test("covers everything from the root when it includes subfolders", () => {
    expect(covers(sync("/", true), "/apps/payments")).toBe(true);
    expect(covers(sync("/", false), "/apps")).toBe(false);
    expect(covers(sync("/", false), "/")).toBe(true);
  });

  test("never covers an ancestor or a sibling sharing a name prefix", () => {
    expect(covers(sync("/apps/payments", true), "/apps")).toBe(false);
    expect(covers(sync("/apps", true), "/apps-legacy")).toBe(false);
  });

  test("never covers a path in another environment", () => {
    expect(covers(sync("/apps", true, "prod"), "/apps")).toBe(false);
  });

  test("never covers anything without a folder", () => {
    expect(
      isPathCoveredBySecretSync(
        { environment: { slug: "dev" }, folder: null },
        { environment: "dev", secretPath: "/" }
      )
    ).toBe(false);
  });

  test("treats trailing and repeated slashes as the same path", () => {
    expect(covers(sync("/apps"), "/apps/")).toBe(true);
    expect(covers(sync("/apps/payments"), "/apps//payments")).toBe(true);
  });
});

describe("getSecretSyncsNewlyCoveringPaths", () => {
  const sync = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: id,
    environment: { slug: "dev" },
    folder: { path: "/apps" },
    syncOptions: { includeAllSubFolders: true },
    ...overrides
  });

  const move = (sourceSecretPath: string, destinationSecretPath: string, environment = "dev") => ({
    source: { environment, secretPath: sourceSecretPath },
    destination: { environment, secretPath: destinationSecretPath }
  });

  const ids = (syncs: { id: string }[]) => syncs.map(({ id }) => id);

  test("leaves out a sync that already covers the source", () => {
    const syncs = [sync("shared", { folder: { path: "/" } }), sync("new")];

    expect(ids(getSecretSyncsNewlyCoveringPaths(syncs, [move("/other", "/apps")]))).toEqual([
      "new"
    ]);
  });

  test("returns nothing when no move lands under a sync", () => {
    expect(getSecretSyncsNewlyCoveringPaths([sync("a")], [move("/", "/other")])).toEqual([]);
    expect(getSecretSyncsNewlyCoveringPaths([sync("a")], [])).toEqual([]);
  });

  test("leaves out a sync rooted beneath the landing path", () => {
    const syncs = [sync("nested", { folder: { path: "/apps/other" } })];

    expect(getSecretSyncsNewlyCoveringPaths(syncs, [move("/x", "/apps")])).toEqual([]);
    expect(getSecretSyncsNewlyCoveringPaths(syncs, [move("/x", "/")])).toEqual([]);
  });

  test("returns a sync once even when several moves land under it", () => {
    const moves = [move("/x", "/apps"), move("/y", "/apps")];

    expect(ids(getSecretSyncsNewlyCoveringPaths([sync("a")], moves))).toEqual(["a"]);
  });

  test("orders syncs by name", () => {
    const syncs = [sync("b", { name: "zeta" }), sync("a", { name: "alpha" })];

    expect(
      getSecretSyncsNewlyCoveringPaths(syncs, [move("/other", "/apps")]).map(({ name }) => name)
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("getSecretSyncsDuplicatedByCopies", () => {
  const sync = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: id,
    environment: { slug: "dev" },
    folder: { path: "/" },
    syncOptions: { includeAllSubFolders: true },
    ...overrides
  });

  const copy = (
    sourceSecretPath: string,
    destinationSecretPath: string,
    sourceEnvironment = "dev",
    destinationEnvironment = sourceEnvironment
  ) => ({
    source: { environment: sourceEnvironment, secretPath: sourceSecretPath },
    destination: { environment: destinationEnvironment, secretPath: destinationSecretPath }
  });

  const ids = (syncs: { id: string }[]) => syncs.map(({ id }) => id);

  test("returns a sync that covers both the source and the destination", () => {
    expect(ids(getSecretSyncsDuplicatedByCopies([sync("a")], [copy("/", "/bench")]))).toEqual([
      "a"
    ]);
    expect(
      ids(getSecretSyncsDuplicatedByCopies([sync("a")], [copy("/apps/x", "/apps/y")]))
    ).toEqual(["a"]);
  });

  test("leaves out a sync that covers only one side", () => {
    const syncs = [sync("a", { folder: { path: "/apps" } })];

    expect(getSecretSyncsDuplicatedByCopies(syncs, [copy("/other", "/apps")])).toEqual([]);
    expect(getSecretSyncsDuplicatedByCopies(syncs, [copy("/apps", "/other")])).toEqual([]);
  });

  test("leaves out a sync that does not include subfolders", () => {
    const syncs = [sync("a", { syncOptions: { includeAllSubFolders: false } })];

    expect(getSecretSyncsDuplicatedByCopies(syncs, [copy("/", "/bench")])).toEqual([]);
  });

  test("leaves out a copy onto its own path", () => {
    expect(getSecretSyncsDuplicatedByCopies([sync("a")], [copy("/bench", "/bench/")])).toEqual([]);
  });

  test("leaves out a copy into another environment", () => {
    expect(
      getSecretSyncsDuplicatedByCopies([sync("a")], [copy("/", "/bench", "prod", "dev")])
    ).toEqual([]);
    expect(getSecretSyncsDuplicatedByCopies([sync("a")], [copy("/", "/", "dev", "prod")])).toEqual(
      []
    );
  });

  test("returns a sync once even when several copies duplicate into it", () => {
    const copies = [copy("/", "/a"), copy("/x", "/b")];

    expect(ids(getSecretSyncsDuplicatedByCopies([sync("a")], copies))).toEqual(["a"]);
  });

  test("orders syncs by name", () => {
    const syncs = [sync("b", { name: "zeta" }), sync("a", { name: "alpha" })];

    expect(
      getSecretSyncsDuplicatedByCopies(syncs, [copy("/", "/bench")]).map(({ name }) => name)
    ).toEqual(["alpha", "zeta"]);
  });
});
