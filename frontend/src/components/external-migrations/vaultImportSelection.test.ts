import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createVaultImportSelection, vaultImportSelectionReducer } from "./vaultImportSelection";

describe("Vault import selection", () => {
  it("selects the only available app connection by default", () => {
    assert.deepEqual(createVaultImportSelection<string>(["connection-id"]), {
      connectionId: "connection-id",
      namespace: null,
      mountPath: null,
      selection: null
    });
    assert.equal(createVaultImportSelection<string>(["one", "two"]).connectionId, null);
  });

  it("clears every dependent selection when the connection changes", () => {
    const result = vaultImportSelectionReducer(
      {
        connectionId: "old-connection",
        namespace: "admin",
        mountPath: "database",
        selection: "role"
      },
      { type: "connection", value: "new-connection" }
    );

    assert.deepEqual(result, {
      connectionId: "new-connection",
      namespace: null,
      mountPath: null,
      selection: null
    });
  });

  it("clears downstream values as namespace and mount selections change", () => {
    const initial = {
      connectionId: "connection",
      namespace: "old-namespace",
      mountPath: "old-mount",
      selection: ["old-path"]
    };
    const namespaceResult = vaultImportSelectionReducer(initial, {
      type: "namespace",
      value: "new-namespace"
    });
    const mountResult = vaultImportSelectionReducer(namespaceResult, {
      type: "mount",
      value: "new-mount"
    });

    assert.deepEqual(namespaceResult, {
      connectionId: "connection",
      namespace: "new-namespace",
      mountPath: null,
      selection: null
    });
    assert.deepEqual(mountResult, {
      connectionId: "connection",
      namespace: "new-namespace",
      mountPath: "new-mount",
      selection: null
    });
  });
});
