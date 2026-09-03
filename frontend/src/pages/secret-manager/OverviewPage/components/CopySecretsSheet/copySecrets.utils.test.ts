import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterCopyPreviewSecrets,
  getCopyDestinationPath,
  getCopyFolderCreationSteps,
  getCopySecretConflicts,
  getOtherCopyEnvironmentSlug,
  getRelativeCopyPath,
  groupCopySecretsRequests,
  isCopyingToSameLocation,
  isCopySecretSelectable,
  normalizeCopyPath
} from "./copySecrets.utils";

describe("copy secrets paths", () => {
  it("selects an environment other than the excluded environment", () => {
    const environments = [
      { id: "staging", name: "Staging", slug: "staging" },
      { id: "production", name: "Production", slug: "production" }
    ];

    assert.equal(getOtherCopyEnvironmentSlug(environments, "staging"), "production");
    assert.equal(getOtherCopyEnvironmentSlug(environments, "production"), "staging");
    assert.equal(getOtherCopyEnvironmentSlug([environments[0]], "staging"), "");
  });

  it("normalizes root and nested paths", () => {
    assert.equal(normalizeCopyPath("//auth/session//"), "/auth/session");
    assert.equal(normalizeCopyPath("  "), "/");
  });

  it("only returns relative paths inside the source root", () => {
    assert.equal(getRelativeCopyPath("/auth/session", "/auth"), "/session");
    assert.equal(getRelativeCopyPath("/auth", "/auth"), "/");
    assert.equal(getRelativeCopyPath("/payments", "/auth"), null);
  });

  it("filters destination previews by path and change status", () => {
    const secrets = [
      { id: "one", name: "ONE", path: "/apps" },
      { id: "two", name: "TWO", path: "/apps/api", previewStatus: "overwrite" as const },
      { id: "three", name: "THREE", path: "/other", previewStatus: "new" as const }
    ];

    assert.deepEqual(
      filterCopyPreviewSecrets({ secrets, rootPath: "/apps" }).map(({ id }) => id),
      ["one", "two"]
    );
    assert.deepEqual(
      filterCopyPreviewSecrets({ secrets, rootPath: "/apps", changesOnly: true }).map(
        ({ id }) => id
      ),
      ["two"]
    );
  });

  it("keeps hidden-value secrets selectable only when values are omitted", () => {
    const hiddenSecret = {
      id: "hidden",
      name: "HIDDEN",
      path: "/",
      isValueHidden: true
    };

    assert.equal(isCopySecretSelectable(hiddenSecret, true), false);
    assert.equal(isCopySecretSelectable(hiddenSecret, false), true);
    assert.equal(
      isCopySecretSelectable({ ...hiddenSecret, isValueHidden: false, isRotated: true }, false),
      false
    );
    assert.equal(
      isCopySecretSelectable({ ...hiddenSecret, isValueHidden: false, isHoneyToken: true }, false),
      false
    );
  });

  it("supports copying a folder or only its contents", () => {
    assert.equal(
      getCopyDestinationPath({
        sourcePath: "/auth/session",
        sourceRootPath: "/auth",
        destinationRootPath: "/services",
        mode: "folder"
      }),
      "/services/auth/session"
    );
    assert.equal(
      getCopyDestinationPath({
        sourcePath: "/auth/session",
        sourceRootPath: "/auth",
        destinationRootPath: "/services",
        mode: "contents"
      }),
      "/services/session"
    );
  });

  it("allows same-environment copies unless the effective location is unchanged", () => {
    assert.equal(
      isCopyingToSameLocation({
        sourceEnvironment: "development",
        destinationEnvironment: "development",
        sourcePath: "/",
        destinationPath: "/services",
        mode: "contents"
      }),
      false
    );
    assert.equal(
      isCopyingToSameLocation({
        sourceEnvironment: "development",
        destinationEnvironment: "development",
        sourcePath: "/services",
        destinationPath: "/",
        mode: "contents"
      }),
      false
    );
    assert.equal(
      isCopyingToSameLocation({
        sourceEnvironment: "development",
        destinationEnvironment: "development",
        sourcePath: "/services",
        destinationPath: "/services",
        mode: "contents"
      }),
      true
    );
    assert.equal(
      isCopyingToSameLocation({
        sourceEnvironment: "development",
        destinationEnvironment: "development",
        sourcePath: "/services",
        destinationPath: "/",
        mode: "folder"
      }),
      true
    );
    assert.equal(
      isCopyingToSameLocation({
        sourceEnvironment: "development",
        destinationEnvironment: "production",
        sourcePath: "/services",
        destinationPath: "/services",
        mode: "contents"
      }),
      false
    );
  });

  it("creates every folder segment from the root", () => {
    assert.deepEqual(getCopyFolderCreationSteps("/"), []);
    assert.deepEqual(getCopyFolderCreationSteps("/services/auth"), [
      { parentPath: "/", name: "services" },
      { parentPath: "/services", name: "auth" }
    ]);
  });

  it("groups requests by source and destination folders", () => {
    assert.deepEqual(
      groupCopySecretsRequests({
        secrets: [
          { id: "one", name: "ONE", path: "/auth" },
          { id: "two", name: "TWO", path: "/auth/session" },
          { id: "three", name: "THREE", path: "/auth/session" }
        ],
        sourceRootPath: "/auth",
        destinationRootPath: "/",
        mode: "folder"
      }),
      [
        { sourcePath: "/auth", destinationPath: "/auth", secretIds: ["one"] },
        {
          sourcePath: "/auth/session",
          destinationPath: "/auth/session",
          secretIds: ["two", "three"]
        }
      ]
    );
  });

  it("finds conflicts by destination path and key", () => {
    const secrets = [
      { id: "one", name: "API_KEY", path: "/auth" },
      { id: "two", name: "CLIENT_ID", path: "/auth/session" },
      { id: "three", name: "NEW_SECRET", path: "/auth/session" }
    ];
    const requestGroups = groupCopySecretsRequests({
      secrets,
      sourceRootPath: "/auth",
      destinationRootPath: "/services",
      mode: "contents"
    });

    assert.deepEqual(
      getCopySecretConflicts({
        secrets,
        destinationSecrets: [
          { id: "destination-one", name: "API_KEY", path: "/services" },
          { id: "destination-two", name: "CLIENT_ID", path: "/services/session" },
          { id: "same-key-other-path", name: "NEW_SECRET", path: "/other" }
        ],
        requestGroups
      }),
      [
        { sourceSecretId: "one", name: "API_KEY", destinationPath: "/services" },
        {
          sourceSecretId: "two",
          name: "CLIENT_ID",
          destinationPath: "/services/session"
        }
      ]
    );
  });
});
