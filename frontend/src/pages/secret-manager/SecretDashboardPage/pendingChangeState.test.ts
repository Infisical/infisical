import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PendingAction } from "@app/hooks/api/secretFolders/types";

import { mergePendingSecretChange } from "./pendingChangeState";
import type {
  PendingSecretCreate,
  PendingSecretDelete,
  PendingSecretUpdate
} from "./SecretMainPage.store";

const existingSecret = { comment: "original comment" } as PendingSecretUpdate["existingSecret"];

const makeUpdate = (overrides: Partial<PendingSecretUpdate> = {}): PendingSecretUpdate => ({
  id: "secret-1",
  resourceType: "secret",
  type: PendingAction.Update,
  secretKey: "API_KEY",
  originalValue: "original value",
  originalComment: "original comment",
  originalSkipMultilineEncoding: false,
  originalTags: [],
  originalSecretMetadata: [],
  existingSecret,
  timestamp: 1,
  ...overrides
});

const makeCreate = (overrides: Partial<PendingSecretCreate> = {}): PendingSecretCreate => ({
  id: "new-secret-1",
  resourceType: "secret",
  type: PendingAction.Create,
  secretKey: "NEW_SECRET",
  secretValue: "value",
  timestamp: 1,
  ...overrides
});

const makeDelete = (overrides: Partial<PendingSecretDelete> = {}): PendingSecretDelete => ({
  id: "secret-1",
  resourceType: "secret",
  type: PendingAction.Delete,
  secretKey: "API_KEY",
  secretValue: "original value",
  secretValueHidden: false,
  tags: [],
  secretMetadata: [],
  skipMultilineEncoding: false,
  comment: "original comment",
  timestamp: 2,
  ...overrides
});

describe("pending secret change reconciliation", () => {
  it("batches repeated edits into one update and preserves the original values", () => {
    const first = makeUpdate({ secretValue: "first edit" });
    const second = makeUpdate({
      originalValue: "first edit",
      secretComment: "edited comment",
      timestamp: 2
    });

    const result = mergePendingSecretChange(mergePendingSecretChange([], first), second);

    assert.equal(result.length, 1);
    assert.equal(result[0].type, PendingAction.Update);
    if (result[0].type !== PendingAction.Update) return;
    assert.equal(result[0].originalValue, "original value");
    assert.equal(result[0].secretValue, "first edit");
    assert.equal(result[0].secretComment, "edited comment");
  });

  it("replaces an edit with a delete for the same existing secret", () => {
    const result = mergePendingSecretChange([makeUpdate({ secretValue: "edited" })], makeDelete());

    assert.deepEqual(result, [makeDelete()]);
  });

  it("removes a newly created secret when it is deleted before commit", () => {
    const pendingCreate = makeCreate();
    const result = mergePendingSecretChange(
      [pendingCreate],
      makeDelete({ id: pendingCreate.id, secretKey: pendingCreate.secretKey })
    );

    assert.deepEqual(result, []);
  });

  it("keeps edits to a pending create as a single create action", () => {
    const pendingCreate = makeCreate();
    const result = mergePendingSecretChange(
      [pendingCreate],
      makeUpdate({
        id: pendingCreate.id,
        secretKey: pendingCreate.secretKey,
        newSecretName: "RENAMED_SECRET",
        secretValue: "edited value"
      })
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].type, PendingAction.Create);
    if (result[0].type !== PendingAction.Create) return;
    assert.equal(result[0].secretKey, "RENAMED_SECRET");
    assert.equal(result[0].secretValue, "edited value");
  });

  it("drops an update after every field is reverted", () => {
    const result = mergePendingSecretChange(
      [makeUpdate({ secretValue: "edited" })],
      makeUpdate({ secretValue: "original value", timestamp: 2 })
    );

    assert.deepEqual(result, []);
  });
});
