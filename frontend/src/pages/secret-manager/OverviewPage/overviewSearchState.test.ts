import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeOverviewEnvironments,
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
