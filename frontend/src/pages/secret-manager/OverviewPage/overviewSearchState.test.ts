import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasOverviewScopeChanged,
  normalizeOverviewEnvironments,
  resolveOverviewEnvironmentSlugs,
  serializeOverviewResourceFilter,
  serializeOverviewTags,
  updateOverviewSecretPath
} from "./overviewSearchState";

describe("Secrets overview query state", () => {
  it("serializes tags and resource filters canonically", () => {
    assert.equal(serializeOverviewTags(["team-b", " team-a ", "team-b"]), "team-a,team-b");
    assert.equal(
      serializeOverviewResourceFilter({ folder: true, secret: false, dynamic: true }, [
        "folder",
        "dynamic",
        "secret"
      ]),
      "folder,dynamic"
    );
    assert.equal(serializeOverviewTags([]), undefined);
    assert.equal(serializeOverviewResourceFilter({}, ["folder", "secret"]), undefined);
  });

  it("normalizes direct environment links to accessible project slugs", () => {
    assert.deepEqual(normalizeOverviewEnvironments(["removed", "prod", "prod"], ["dev", "prod"]), [
      "prod"
    ]);
  });

  it("resolves environment preferences before the URL is canonicalized", () => {
    const environments = [
      { id: "dev-id", slug: "dev" },
      { id: "prod-id", slug: "prod" }
    ];

    assert.deepEqual(resolveOverviewEnvironmentSlugs([], ["prod-id"], environments), ["prod"]);
    assert.deepEqual(resolveOverviewEnvironmentSlugs(["removed"], ["prod-id"], environments), [
      "prod"
    ]);
    assert.deepEqual(
      resolveOverviewEnvironmentSlugs(["dev", "removed"], ["prod-id"], environments),
      ["dev"]
    );
  });

  it("treats filters as view state and folders or environments as scope state", () => {
    const current = {
      pathname: "/organizations/org/projects/secret-management/project/overview",
      search: { secretPath: "/", environments: ["prod"], search: "api" }
    };

    assert.equal(
      hasOverviewScopeChanged(current, {
        ...current,
        search: { ...current.search, search: "token", filterBy: "secret" }
      }),
      false
    );
    assert.equal(
      hasOverviewScopeChanged(current, {
        ...current,
        search: { ...current.search, secretPath: "/apps" }
      }),
      true
    );
    assert.equal(
      hasOverviewScopeChanged(current, {
        ...current,
        search: { ...current.search, environments: ["dev"] }
      }),
      true
    );
  });

  it("changes only secretPath during folder and breadcrumb transitions", () => {
    const current = {
      secretPath: "/",
      environments: ["prod"],
      search: "api",
      tags: "team-a",
      filterBy: "folder,secret",
      unrelated: "preserved"
    };

    assert.deepEqual(updateOverviewSecretPath(current, "/apps"), {
      ...current,
      secretPath: "/apps"
    });
  });
});
