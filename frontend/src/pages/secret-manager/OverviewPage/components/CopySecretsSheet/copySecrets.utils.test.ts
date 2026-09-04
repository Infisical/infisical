import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterCopyPreviewSecrets,
  getCopyDestinationFolderPaths,
  getCopyDestinationPath,
  getCopyFolderCreationSteps,
  getCopySecretConflicts,
  getInitialCopyState,
  getInvocationCopySelection,
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

  it("keeps hidden-value secrets selectable and excludes managed secrets", () => {
    const hiddenSecret = {
      id: "hidden",
      name: "HIDDEN",
      path: "/",
      isValueHidden: true
    };

    assert.equal(isCopySecretSelectable(hiddenSecret), true);
    assert.equal(
      isCopySecretSelectable({ ...hiddenSecret, isValueHidden: false, isRotated: true }),
      false
    );
    assert.equal(
      isCopySecretSelectable({ ...hiddenSecret, isValueHidden: false, isHoneyToken: true }),
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
        { sourcePath: "/auth", destinationPath: "/auth", secretIds: ["one"], includeValues: true },
        {
          sourcePath: "/auth/session",
          destinationPath: "/auth/session",
          secretIds: ["two", "three"],
          includeValues: true
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

describe("copy invocation selection", () => {
  const environments = [
    { id: "dev", slug: "dev", name: "Development" },
    { id: "prod", slug: "prod", name: "Production" }
  ];
  const invocation = {
    origin: "bulk" as const,
    sourcePath: "/app",
    selectedSecretCount: 2,
    secretsByEnvironment: {
      dev: [{ id: "old-key", name: "KEY", path: "/app", isValueHidden: true }],
      prod: [
        { id: "prod-key", name: "KEY", path: "/app" },
        { id: "other", name: "OTHER", path: "/app" }
      ]
    },
    folderNames: ["empty", "nested"],
    foldersByEnvironment: { dev: [{ path: "/app/empty" }, { path: "/app/nested" }] }
  };

  it("opens the dropdown from the current source environment and folder", () => {
    assert.deepEqual(
      getInitialCopyState(
        { origin: "toolbar", sourceEnvironmentSlug: "dev", sourcePath: "/app" },
        environments
      ),
      {
        sourceEnvironmentSlug: "dev",
        sourcePath: "/app",
        destinationEnvironmentSlug: "prod",
        destinationPath: "/",
        mode: "folder"
      }
    );
  });

  it("uses the current environment for bulk entry and leaves multi-environment sources to the user", () => {
    assert.equal(getInitialCopyState(invocation, environments).sourceEnvironmentSlug, "");
    assert.equal(
      getInitialCopyState({ ...invocation, sourceEnvironmentSlug: "prod" }, environments)
        .sourceEnvironmentSlug,
      "prod"
    );
  });

  it("permits single-environment projects to choose another destination folder", () => {
    assert.equal(
      getInitialCopyState({ origin: "toolbar", sourceEnvironmentSlug: "dev", sourcePath: "/" }, [
        environments[0]
      ]).destinationEnvironmentSlug,
      "dev"
    );
  });

  it("preselects the invocation after initially empty loading data, using the current environment's IDs", () => {
    assert.deepEqual(
      getInvocationCopySelection({ invocation, sourcePath: "/app", secrets: [], folders: [] }),
      { secretIds: [], folderPaths: [] }
    );
    assert.deepEqual(
      getInvocationCopySelection({
        invocation,
        sourcePath: "/app",
        secrets: [
          { id: "current-key", name: "KEY", path: "/app", isValueHidden: true },
          { id: "unselected", name: "UNSELECTED", path: "/app" },
          { id: "nested-key", name: "NESTED", path: "/app/nested/child" },
          { id: "honey", name: "HONEY", path: "/app/nested", isHoneyToken: true },
          { id: "wrong-path", name: "KEY", path: "/elsewhere" }
        ],
        folders: [
          { path: "/app/empty" },
          { path: "/app/nested" },
          { path: "/app/nested/child" },
          { path: "/app/other" }
        ]
      }),
      {
        secretIds: ["current-key", "nested-key"],
        folderPaths: ["/app/empty", "/app/nested", "/app/nested/child"]
      }
    );
  });

  it("keeps selection scoped to the edited source path", () => {
    assert.deepEqual(
      getInvocationCopySelection({
        invocation,
        sourcePath: "/different",
        secrets: [
          { id: "original", name: "KEY", path: "/app" },
          { id: "edited", name: "KEY", path: "/different" }
        ],
        folders: [{ path: "/different/empty" }, { path: "/app/empty" }]
      }),
      {
        secretIds: ["edited"],
        folderPaths: ["/different/empty"]
      }
    );
  });

  it("does not auto-select unrequested secrets from a toolbar invocation", () => {
    assert.deepEqual(
      getInvocationCopySelection({
        invocation: { origin: "toolbar", sourceEnvironmentSlug: "dev", sourcePath: "/app" },
        sourcePath: "/app",
        secrets: [{ id: "one", name: "KEY", path: "/app" }],
        folders: [{ path: "/app" }]
      }),
      { secretIds: [], folderPaths: [] }
    );
  });
});

describe("copy requests", () => {
  const secrets = [
    { id: "readable", name: "READABLE", path: "/app" },
    { id: "hidden", name: "HIDDEN", path: "/app", isValueHidden: true },
    { id: "nested", name: "NESTED", path: "/app/nested" },
    { id: "honey", name: "HONEY", path: "/app", isHoneyToken: true },
    { id: "rotated", name: "ROTATED", path: "/app", isRotated: true }
  ];
  it("copies readable values while batching restricted keys without values", () => {
    const groups = groupCopySecretsRequests({
      secrets,
      sourceRootPath: "/app",
      destinationRootPath: "/copy",
      mode: "contents",
      includeValues: true
    });
    assert.deepEqual(groups, [
      {
        sourcePath: "/app",
        destinationPath: "/copy",
        secretIds: ["readable"],
        includeValues: true
      },
      { sourcePath: "/app", destinationPath: "/copy", secretIds: ["hidden"], includeValues: false },
      {
        sourcePath: "/app/nested",
        destinationPath: "/copy/nested",
        secretIds: ["nested"],
        includeValues: true
      }
    ]);
    assert.equal(
      getCopySecretConflicts({
        secrets,
        requestGroups: groups,
        destinationSecrets: [{ id: "existing", name: "HIDDEN", path: "/copy" }]
      })[0].sourceSecretId,
      "hidden"
    );
  });
  it("omits all values when the property is deselected without dropping restricted keys", () => {
    const groups = groupCopySecretsRequests({
      secrets,
      sourceRootPath: "/app",
      destinationRootPath: "/",
      mode: "folder",
      includeValues: false
    });
    assert.deepEqual(
      groups.map(({ secretIds, includeValues }) => ({ secretIds, includeValues })),
      [
        { secretIds: ["readable", "hidden"], includeValues: false },
        { secretIds: ["nested"], includeValues: false }
      ]
    );
  });
  it("maps empty and nested folders even when there are no secrets", () => {
    assert.deepEqual(
      getCopyDestinationFolderPaths({
        folderPaths: ["/app/empty", "/app/nested", "/app/nested/empty", "/unrelated"],
        sourceRootPath: "/app",
        destinationRootPath: "/copy",
        mode: "contents"
      }),
      ["/copy/empty", "/copy/nested", "/copy/nested/empty"]
    );
    assert.deepEqual(
      getCopyDestinationFolderPaths({
        folderPaths: ["/app"],
        sourceRootPath: "/app",
        destinationRootPath: "/copy",
        mode: "folder"
      }),
      ["/copy/app"]
    );
  });
});
