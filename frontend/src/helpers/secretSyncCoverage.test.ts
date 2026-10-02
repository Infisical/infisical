import { describe, expect, test } from "vitest";

import {
  getSecretSyncsNewlyCoveringPaths,
  isPathCoveredBySecretSync,
  isPathOrDescendantCoveredBySecretSync
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

describe("isPathOrDescendantCoveredBySecretSync", () => {
  const sync = (path: string, includeAllSubFolders = false, environment = "dev") => ({
    environment: { slug: environment },
    folder: { path },
    syncOptions: { includeAllSubFolders }
  });

  const covers = (entry: ReturnType<typeof sync>, secretPath: string, environment = "dev") =>
    isPathOrDescendantCoveredBySecretSync(entry, { environment, secretPath });

  test("covers whatever the path itself is covered by", () => {
    expect(covers(sync("/apps"), "/apps")).toBe(true);
    expect(covers(sync("/", true), "/apps")).toBe(true);
  });

  test("covers a sync rooted anywhere beneath the path, recursive or not", () => {
    expect(covers(sync("/apps/payments"), "/apps")).toBe(true);
    expect(covers(sync("/apps/payments/api", true), "/apps")).toBe(true);
    expect(covers(sync("/apps"), "/")).toBe(true);
  });

  test("never covers a non-recursive ancestor, a sibling, or another environment", () => {
    expect(covers(sync("/"), "/apps")).toBe(false);
    expect(covers(sync("/apps-legacy/api"), "/apps")).toBe(false);
    expect(covers(sync("/apps/payments", false, "prod"), "/apps")).toBe(false);
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

  const check = (sourceSecretPath: string, destinationSecretPath: string, environment = "dev") => ({
    sourceEnvironment: environment,
    sourceSecretPath,
    destinationEnvironment: environment,
    destinationSecretPath
  });

  const ids = (syncs: { id: string }[]) => syncs.map(({ id }) => id);

  test("leaves out a sync that already covers the source", () => {
    const syncs = [sync("shared", { folder: { path: "/" } }), sync("new")];

    expect(ids(getSecretSyncsNewlyCoveringPaths(syncs, [check("/other", "/apps")]))).toEqual([
      "new"
    ]);
  });

  test("returns nothing when no check lands under a sync", () => {
    expect(getSecretSyncsNewlyCoveringPaths([sync("a")], [check("/", "/other")])).toEqual([]);
    expect(getSecretSyncsNewlyCoveringPaths([sync("a")], [])).toEqual([]);
  });

  test("returns a sync once even when several checks land under it", () => {
    const checks = [check("/x", "/apps"), { ...check("/y", "/apps"), sourceEnvironment: "prod" }];

    expect(ids(getSecretSyncsNewlyCoveringPaths([sync("a")], checks))).toEqual(["a"]);
  });

  test("orders syncs by name", () => {
    const syncs = [sync("b", { name: "zeta" }), sync("a", { name: "alpha" })];

    expect(
      getSecretSyncsNewlyCoveringPaths(syncs, [check("/other", "/apps")]).map(({ name }) => name)
    ).toEqual(["alpha", "zeta"]);
  });
});
