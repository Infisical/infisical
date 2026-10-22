import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createStore } from "zustand";

import { PendingAction } from "@app/hooks/api/secretFolders/types";

import {
  BatchContext,
  BatchModeState,
  createBatchModeStore,
  PendingSecretCreate
} from "./SecretMainPage.store";

const createTestStore = () =>
  createStore<BatchModeState>()((...args) =>
    createBatchModeStore(...(args as unknown as Parameters<typeof createBatchModeStore>))
  );

const contextFor = (environment: string): BatchContext => ({
  projectId: "project-1",
  environment,
  secretPath: "/test"
});

const makeCreate = (id: string): PendingSecretCreate => ({
  id,
  resourceType: "secret",
  type: PendingAction.Create,
  secretKey: "NEW_SECRET",
  secretValue: "value",
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
});
