import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource, Secret } from "../secrets-model";
import { moveFolderResources, planSecretMove, relocate } from "../secrets/bulk/move-resources";
import { useResourceApply } from "./apply";

const mutations = vi.hoisted(() => ({
  useCreateSecret: { mutateAsync: vi.fn() },
  useUpdateSecret: { mutateAsync: vi.fn() },
  useDeleteSecret: { mutateAsync: vi.fn() },
  useCreateSecretBatch: { mutateAsync: vi.fn() },
  useDeleteSecretBatch: { mutateAsync: vi.fn() },
  useMoveSecrets: { mutateAsync: vi.fn() },
  useCreateFolder: { mutateAsync: vi.fn() },
  useUpdateFolder: { mutateAsync: vi.fn() },
  useDeleteFolder: { mutateAsync: vi.fn() },
  useMoveFolder: { mutateAsync: vi.fn() },
  useCreateSecretImport: { mutateAsync: vi.fn() },
  useDeleteSecretImport: { mutateAsync: vi.fn() },
  useResyncSecretImport: { mutateAsync: vi.fn() }
}));

vi.mock("../../../data/adapters", () => ({
  useV4Adapter: () =>
    Object.fromEntries(Object.entries(mutations).map(([name, mutation]) => [name, () => mutation]))
}));
vi.mock("@app/hooks/api/secrets/types", () => ({
  SecretType: { Shared: "shared", Personal: "personal" }
}));

const secret = (overrides: Partial<Secret> = {}): Secret => ({
  id: "source-id",
  kind: "secret",
  project: "project-id",
  environment: "dev",
  path: "/source",
  name: "API_KEY",
  value: { status: "unreadable" },
  comment: "",
  tags: [],
  metadata: [],
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides
});
const rotation = (): Extract<Resource, { kind: "rotation" }> => ({
  id: "rotation-id",
  kind: "rotation",
  project: "project-id",
  environment: "dev",
  path: "/source",
  name: "rotation",
  provider: "test-provider",
  connection: "test-connection",
  status: "success",
  autoRotation: false,
  lastRotatedAt: "2026-01-01T00:00:00Z",
  managedKeys: ["API_KEY"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
});
const apply = () => {
  let result: ReturnType<typeof useResourceApply> | undefined;
  function TestComponent() {
    result = useResourceApply({ projectId: "project-id", projectSlug: "project", tags: [] });
    return null;
  }
  renderToStaticMarkup(createElement(TestComponent));
  if (!result) throw new Error("Resource apply hook did not render");
  return result;
};
const plan = (before: Resource[], shouldOverwrite: boolean) => {
  const result = planSecretMove(before, {
    project: "project-id",
    sourceEnvironment: "dev",
    sourcePath: "/source",
    destinationEnvironment: "prod",
    destinationPath: "/destination",
    names: ["API_KEY"],
    shouldOverwrite
  });
  if ("error" in result) throw new Error(result.error);
  return result.next;
};
const expectNoWrites = () => {
  Object.values(mutations).forEach(({ mutateAsync }) => expect(mutateAsync).not.toHaveBeenCalled());
};
const expectNoReplacement = () => {
  expect(mutations.useDeleteSecretBatch.mutateAsync).not.toHaveBeenCalled();
  expect(mutations.useCreateSecretBatch.mutateAsync).not.toHaveBeenCalled();
  expect(mutations.useUpdateSecret.mutateAsync).not.toHaveBeenCalled();
};

beforeEach(() => {
  Object.values(mutations).forEach(({ mutateAsync }) => mutateAsync.mockReset());
});

describe("secret moves", () => {
  it.each(["unreadable", "loading", "failed"] as const)(
    "moves a %s value by its existing ID without reading or replacing it",
    async (status) => {
      const source = secret({
        value: status === "failed" ? { status, message: "Read failed" } : { status }
      });
      const moved = relocate(source, "prod", "/destination");
      expect(moved.id).toBe(source.id);
      expect(moved.value).toEqual(source.value);
      await apply()([source], [moved]);
      expect(mutations.useMoveSecrets.mutateAsync).toHaveBeenCalledExactlyOnceWith({
        projectId: "project-id",
        projectSlug: "project",
        sourceEnvironment: "dev",
        sourceSecretPath: "/source",
        destinationEnvironment: "prod",
        destinationSecretPath: "/destination",
        secretIds: [source.id],
        shouldOverwrite: false
      });
      expectNoReplacement();
    }
  );

  it("leaves source and destination intact if the native move fails", async () => {
    const source = secret();
    const destination = secret({ id: "destination-id", environment: "prod", path: "/destination" });
    mutations.useMoveSecrets.mutateAsync.mockRejectedValueOnce(
      new Error("Destination unavailable")
    );
    await expect(
      apply()([source, destination], plan([source, destination], true), {
        shouldOverwrite: true
      })
    ).rejects.toThrow("Destination unavailable");
    expectNoReplacement();
    expect(mutations.useMoveSecrets.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ secretIds: [source.id], shouldOverwrite: true })
    );
  });

  it("blocks a masked destination conflict unless overwrite is enabled", () => {
    const source = secret();
    const destination = secret({ id: "destination-id", environment: "prod", path: "/destination" });
    expect(() => plan([source, destination], false)).toThrow("already exist");
    expect(plan([source, destination], true).map(({ id }) => id)).toEqual([
      source.id,
      destination.id
    ]);
    expectNoWrites();
  });

  it("keeps equal-valued source secrets in the native move plan", async () => {
    const source = secret({ value: { status: "present", value: "test-only-value" } });
    const destination = secret({
      id: "destination-id",
      environment: "prod",
      path: "/destination",
      value: source.value
    });
    await apply()([source, destination], plan([source, destination], true), {
      shouldOverwrite: true
    });
    expect(mutations.useMoveSecrets.mutateAsync).toHaveBeenCalledOnce();
    expectNoReplacement();
  });

  it("delegates overwriting an existing destination to the move endpoint", async () => {
    const source = secret();
    const destination = secret({ id: "destination-id", environment: "prod", path: "/destination" });
    await apply()([source, destination], plan([source, destination], true), {
      shouldOverwrite: true
    });
    expect(mutations.useMoveSecrets.mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ shouldOverwrite: true, secretIds: [source.id] })
    );
    expectNoReplacement();
  });

  it("moves a folder and its masked descendants using only the folder endpoint", async () => {
    const folder: Resource = {
      id: "folder-id",
      kind: "folder",
      project: "project-id",
      environment: "dev",
      path: "/",
      name: "source",
      description: "",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };
    const source = secret();
    const unrelated = secret({ id: "unrelated-id", path: "/source-other" });
    const before = [folder, source, unrelated];
    const after = moveFolderResources(
      before,
      folder,
      [{ environment: "dev", destinationEnvironment: "prod" }],
      "/destination"
    );
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(after[1].path).toBe("/destination/source");
    expect(after[2]).toBe(unrelated);
    await apply()(before, after);
    expect(mutations.useMoveFolder.mutateAsync).toHaveBeenCalledExactlyOnceWith({
      projectId: "project-id",
      folderId: "folder-id",
      sourceEnvironment: "dev",
      sourcePath: "/",
      destinationEnvironment: "prod",
      destinationPath: "/destination"
    });
    expect(mutations.useMoveSecrets.mutateAsync).not.toHaveBeenCalled();
    expect(mutations.useDeleteFolder.mutateAsync).not.toHaveBeenCalled();
    expect(mutations.useCreateFolder.mutateAsync).not.toHaveBeenCalled();
    expectNoReplacement();
  });
});

describe("rotation relocation safety", () => {
  it("rejects unsupported independent rotation moves before any mutation", async () => {
    const source = rotation();
    const managedSecret = secret({ managedBy: source.name });
    await expect(
      apply()(
        [source, managedSecret],
        [relocate(source, "prod", "/destination"), relocate(managedSecret, "prod", "/destination")]
      )
    ).rejects.toThrow("Moving secret rotations is not supported here yet.");
    expectNoWrites();
  });

  it("allows a folder rename to carry its rotation descendants", async () => {
    const folder: Resource = {
      id: "folder-id",
      kind: "folder",
      project: "project-id",
      environment: "dev",
      path: "/",
      name: "source",
      description: "",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };
    const child = rotation();
    await apply()(
      [folder, child],
      [
        { ...folder, name: "renamed" },
        { ...child, path: "/renamed" }
      ]
    );
    expect(mutations.useUpdateFolder.mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ folderId: folder.id, name: "renamed" })
    );
    expect(mutations.useMoveFolder.mutateAsync).not.toHaveBeenCalled();
    expect(mutations.useMoveSecrets.mutateAsync).not.toHaveBeenCalled();
    expectNoReplacement();
  });
});

describe("fail-closed creation", () => {
  it.each(["unreadable", "loading", "failed"] as const)(
    "rejects an unavailable %s value before deleting anything",
    async (status) => {
      const source = secret();
      const replacement = secret({
        id: "replacement-id",
        value: status === "failed" ? { status, message: "Read failed" } : { status }
      });
      await expect(apply()([source], [replacement])).rejects.toThrow(
        "Load all selected secret values before creating secrets."
      );
      expectNoWrites();
    }
  );

  it("allows an intentionally empty value", async () => {
    await apply()([], [secret({ value: { status: "present", value: "" } })]);
    expect(mutations.useCreateSecretBatch.mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        secrets: [expect.objectContaining({ secretKey: "API_KEY", secretValue: "" })]
      })
    );
  });
});
