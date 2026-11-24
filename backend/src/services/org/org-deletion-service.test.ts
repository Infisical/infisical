import { EventModificationType } from "@app/domains/platform/events/ce/module";
import { NotFoundError } from "@app/lib/errors";

import { orgDeletionServiceFactory } from "./org-deletion-service";
import { OrganizationModifiedEventV1 } from "./org-events";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const TX = { isTx: true };

const build = (
  deletedOrg: Record<string, unknown> | null = { id: ORG_ID, rootOrgId: null },
  projects: { id: string; version: number }[] = []
) => {
  const calls: string[] = [];
  const orgDAL = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      calls.push("tx");
      return fn(TX);
    }),
    deleteById: vi.fn(async () => deletedOrg)
  };
  const eventEmitter = { emit: vi.fn(async () => {}) };
  const honeyTokenCleanupService = {
    revokeOrgHoneyTokens: vi.fn(async () => {
      calls.push("honey-tokens");
    })
  };
  const folderDAL = { findByProjectId: vi.fn(async (projectId: string) => [{ id: `folder-${projectId}` }]) };
  const secretDAL = { find: vi.fn(async () => [{ id: "legacy-secret", secretReminderRepeatDays: 7 }]) };
  const reminderService = { deleteReminderBySecretId: vi.fn(async () => {}) };
  const service = orgDeletionServiceFactory({
    orgDAL,
    projectDAL: { find: vi.fn(async () => projects) },
    secretDAL,
    folderDAL,
    reminderService,
    honeyTokenCleanupService,
    eventEmitter
  } as unknown as Parameters<typeof orgDeletionServiceFactory>[0]);
  return { service, orgDAL, eventEmitter, calls, folderDAL, reminderService };
};

describe("orgDeletionServiceFactory", () => {
  test("cleans up outside the tx, then deletes and emits the event inside it", async () => {
    const { service, orgDAL, eventEmitter, calls } = build();

    const org = await service.deleteOrganization(ORG_ID);

    expect(org).toEqual({ id: ORG_ID, rootOrgId: null });
    expect(calls).toEqual(["honey-tokens", "tx"]);
    expect(orgDAL.deleteById).toHaveBeenCalledWith(ORG_ID, TX);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: OrganizationModifiedEventV1.type,
          data: { organizationId: ORG_ID, rootOrgId: null, modificationType: EventModificationType.Deleted }
        })
      ],
      TX
    );
  });

  test("asks assertDeletable before the cleanup and again in the delete's tx", async () => {
    const { service, orgDAL, calls } = build();
    const assertDeletable = vi.fn(async (tx?: unknown) => {
      calls.push(tx ? "assert-in-tx" : "assert");
    });

    await service.deleteOrganization(ORG_ID, undefined, assertDeletable);

    expect(calls).toEqual(["assert", "honey-tokens", "tx", "assert-in-tx"]);
    expect(assertDeletable).toHaveBeenLastCalledWith(TX);
    expect(orgDAL.deleteById).toHaveBeenCalled();
  });

  test("deletes nothing when assertDeletable refuses in the delete's tx", async () => {
    const { service, orgDAL } = build();
    const assertDeletable = vi.fn(async (tx?: unknown) => {
      if (tx) throw new Error("not deletable");
    });

    await expect(service.deleteOrganization(ORG_ID, undefined, assertDeletable)).rejects.toThrow("not deletable");
    expect(orgDAL.deleteById).not.toHaveBeenCalled();
  });

  test("runs inDeleteTx in the delete's tx and returns what it returns", async () => {
    const { service } = build();
    const inDeleteTx = vi.fn(async (org: { id: string }, tx: unknown) => ({ id: org.id, tx }));

    const result = await service.deleteOrganization(ORG_ID, inDeleteTx);

    expect(result).toEqual({ id: ORG_ID, tx: TX });
  });

  test("propagates an inDeleteTx failure so the tx rolls back", async () => {
    const { service } = build();

    await expect(
      service.deleteOrganization(ORG_ID, async () => {
        throw new Error("token issue failed");
      })
    ).rejects.toThrow("token issue failed");
  });

  test("deletes an org holding a legacy project without asking for its project bot", async () => {
    const { service, orgDAL, folderDAL, reminderService } = build(undefined, [
      { id: "legacy-project", version: 2 },
      { id: "v3-project", version: 3 }
    ]);

    await service.deleteOrganization(ORG_ID);

    expect(folderDAL.findByProjectId).toHaveBeenCalledTimes(1);
    expect(folderDAL.findByProjectId).toHaveBeenCalledWith("legacy-project");
    expect(reminderService.deleteReminderBySecretId).toHaveBeenCalledWith("legacy-secret", "legacy-project");
    expect(orgDAL.deleteById).toHaveBeenCalledWith(ORG_ID, TX);
  });

  test("throws not found when there is no org to delete", async () => {
    const { service, eventEmitter } = build(null);

    await expect(service.deleteOrganization(ORG_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
