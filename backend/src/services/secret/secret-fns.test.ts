import { describe, expect, test, vi } from "vitest";

import { fnDeleteProjectSecretReminders } from "./secret-fns";

describe("fnDeleteProjectSecretReminders", () => {
  const fakeTx = { __isFakeKnexTransaction: true } as never;

  const makeDeps = () => {
    const folders = [{ id: "folder-1" }, { id: "folder-2" }];
    const secrets = [{ id: "secret-1", reminderRepeatDays: 7 }];

    const folderDAL = { findByProjectId: vi.fn().mockResolvedValue(folders) };
    const secretV2BridgeDAL = { find: vi.fn().mockResolvedValue(secrets) };
    const secretDAL = { find: vi.fn().mockResolvedValue([]) };
    const reminderService = { deleteReminderBySecretId: vi.fn().mockResolvedValue(undefined) };
    const projectBotService = {
      getBotKey: vi.fn().mockResolvedValue({ shouldUseSecretV2Bridge: true })
    };

    return { folderDAL, secretV2BridgeDAL, secretDAL, reminderService, projectBotService };
  };

  test("threads the caller's transaction through every DAL/service call it makes", async () => {
    const deps = makeDeps();

    await fnDeleteProjectSecretReminders("project-1", deps, fakeTx);

    expect(deps.folderDAL.findByProjectId).toHaveBeenCalledWith("project-1", fakeTx);
    expect(deps.secretV2BridgeDAL.find).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tx: fakeTx }));
    expect(deps.reminderService.deleteReminderBySecretId).toHaveBeenCalledWith("secret-1", "project-1", fakeTx);
  });

  test("still works when called without a transaction (e.g. outside an org-deletion transaction)", async () => {
    const deps = makeDeps();

    await fnDeleteProjectSecretReminders("project-1", deps);

    expect(deps.folderDAL.findByProjectId).toHaveBeenCalledWith("project-1", undefined);
    expect(deps.reminderService.deleteReminderBySecretId).toHaveBeenCalledWith("secret-1", "project-1", undefined);
  });
});
