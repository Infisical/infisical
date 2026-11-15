import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
import { createStore } from "zustand";

import { createNotification } from "@app/components/notifications";
import { PendingAction } from "@app/hooks/api/secretFolders/types";

import {
  BatchContext,
  BatchModeState,
  createBatchModeStore,
  PendingFolderCreate,
  PendingSecretCreate
} from "./SecretMainPage.store";

vi.mock("@app/components/notifications", () => ({ createNotification: vi.fn() }));

const createTestStore = () =>
  createStore<BatchModeState>()((...args) =>
    createBatchModeStore(...(args as unknown as Parameters<typeof createBatchModeStore>))
  );

const contextFor = (environment: string): BatchContext => ({
  projectId: "project-1",
  environment,
  secretPath: "/test"
});

const makeCreate = (id: string, secretKey = "NEW_SECRET"): PendingSecretCreate => ({
  id,
  resourceType: "secret",
  type: PendingAction.Create,
  secretKey,
  secretValue: "value",
  timestamp: 1
});

const makeFolderCreate = (id: string, folderName: string): PendingFolderCreate => ({
  id,
  resourceType: "folder",
  type: PendingAction.Create,
  folderName,
  parentPath: "/test",
  timestamp: 1
});

describe("batch mode store", () => {
  it("keeps the viewed environment when staging a create across several environments", () => {
    const store = createTestStore();
    const { batchActions } = store.getState();

    batchActions.loadPendingChanges(contextFor("prod"));
    ["prod", "dev", "staging"].forEach((env) =>
      batchActions.addPendingChange(makeCreate(`create-${env}`), contextFor(env))
    );

    const state = store.getState();
    assert.equal(state.currentContext?.environment, "prod");
    assert.deepEqual(
      state.pendingChanges.secrets.map((s) => s.id),
      ["create-prod"]
    );

    batchActions.clearAllPendingChanges(contextFor("prod"));
    assert.equal(store.getState().pendingChanges.secrets.length, 0);

    batchActions.loadPendingChanges(contextFor("dev"));
    assert.deepEqual(
      store.getState().pendingChanges.secrets.map((s) => s.id),
      ["create-dev"]
    );
  });

  it("leaves the store untouched when a change for any environment is rejected", () => {
    const store = createTestStore();
    const { batchActions } = store.getState();

    batchActions.loadPendingChanges(contextFor("prod"));
    batchActions.setExistingKeys(["EXISTING_SECRET"], ["existing-folder"]);
    batchActions.addPendingChange(makeCreate("create-prod"), contextFor("prod"));
    batchActions.addPendingChange(makeCreate("create-dev"), contextFor("dev"));

    const before = store.getState();
    const rejectedChanges = [
      { change: makeCreate("dup-prod", "EXISTING_SECRET"), env: "prod" },
      { change: makeCreate("dup-dev", "EXISTING_SECRET"), env: "dev" },
      { change: makeFolderCreate("dup-folder-dev", "existing-folder"), env: "dev" }
    ];

    rejectedChanges.forEach(({ change, env }) => {
      batchActions.addPendingChange(change, contextFor(env));

      const after = store.getState();
      assert.equal(after.currentContext, before.currentContext);
      assert.equal(after.pendingChanges, before.pendingChanges);
      assert.equal(after.pendingChangesByContext, before.pendingChangesByContext);
    });

    assert.equal(vi.mocked(createNotification).mock.calls.length, rejectedChanges.length);
    assert.equal(store.getState().currentContext?.environment, "prod");
    assert.deepEqual(
      store.getState().pendingChanges.secrets.map((s) => s.id),
      ["create-prod"]
    );
  });
});
