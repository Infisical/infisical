import { SecretType } from "@app/db/schemas";

import { fnSecretBulkDelete } from "./secret-v2-bridge-fns";

describe("fnSecretBulkDelete", () => {
  test("removes the reminder of every deleted shared secret, whatever the legacy repeat-days column holds", async () => {
    const removeSecretReminder = vi.fn().mockResolvedValue(undefined);
    const tx = { tx: "bulk-delete" } as never;

    await fnSecretBulkDelete({
      folderId: "folder-1",
      projectId: "proj-1",
      inputSecrets: [{ type: SecretType.Shared, secretKey: "DB_PASSWORD" }],
      actorId: "user-1",
      tx,
      commitChanges: [],
      secretDAL: {
        deleteMany: vi.fn().mockResolvedValue([
          { id: "secret-1", type: SecretType.Shared, reminderRepeatDays: null },
          { id: "secret-2", type: SecretType.Personal, reminderRepeatDays: null }
        ])
      },
      secretQueueService: { removeSecretReminder },
      folderCommitService: { createCommit: vi.fn() },
      secretVersionDAL: { findLatestVersionMany: vi.fn().mockResolvedValue({}) }
    } as never);

    expect(removeSecretReminder).toHaveBeenCalledTimes(1);
    expect(removeSecretReminder).toHaveBeenCalledWith({ secretId: "secret-1", projectId: "proj-1" }, tx);
  });
});
