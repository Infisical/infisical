import { NotFoundError } from "@app/lib/errors";
import { EventModificationType } from "@app/services/event-outbox/event-definition";

import { orgDeletionServiceFactory } from "./org-deletion-service";
import { OrganizationModifiedEventV1 } from "./org-events";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const TX = { isTx: true };

const build = (deletedOrg: Record<string, unknown> | null = { id: ORG_ID, rootOrgId: null }) => {
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
  const service = orgDeletionServiceFactory({
    orgDAL,
    projectDAL: { find: vi.fn(async () => []) },
    secretDAL: { find: vi.fn() },
    folderDAL: { findByProjectId: vi.fn() },
    projectBotService: { getBotKey: vi.fn() },
    reminderService: { deleteReminderBySecretId: vi.fn() },
    honeyTokenCleanupService,
    eventEmitter
  } as unknown as Parameters<typeof orgDeletionServiceFactory>[0]);
  return { service, orgDAL, eventEmitter, calls };
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

  test("throws not found when there is no org to delete", async () => {
    const { service, eventEmitter } = build(null);

    await expect(service.deleteOrganization(ORG_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
