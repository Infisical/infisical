import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { SECRET_REMINDER_DUE_EVENT, SECRET_REMINDER_RESOURCE_TYPE } from "./reminder-events";
import { reminderServiceFactory } from "./reminder-service";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

type TDueReminder = {
  id: string;
  secretId: string | null;
  message: string | null;
  repeatDays: number | null;
  nextReminderDate: Date;
  orgId: string;
  projectId: string;
};

const reminder = (over: Partial<TDueReminder> = {}): TDueReminder => ({
  id: "rem-1",
  secretId: "secret-1",
  message: "rotate it",
  repeatDays: 30,
  nextReminderDate: new Date("2026-10-10T00:00:00.000Z"),
  orgId: "org-1",
  projectId: "proj-1",
  ...over
});

const buildService = (opts: {
  due?: TDueReminder[];
  // The row as the dispatch transaction reads it back; defaults to the row as it was found due.
  current?: (due: TDueReminder) => TDueReminder | undefined;
  emitFails?: (secretId: string) => boolean;
  orphanBatches?: string[][];
}) => {
  const log: string[] = [];
  const emitted: Array<{ eventType: string; idempotencyKey?: string; payload: Record<string, unknown>; tx: unknown }> =
    [];
  const updates: Array<{ id: string; nextReminderDate: Date; tx: unknown }> = [];
  const deletes: Array<{ id: string; tx: unknown }> = [];
  const reaped: string[][] = [];
  const orphanBatches = [...(opts.orphanBatches ?? [])];
  let window: { from: Date; to: Date } | undefined;

  const service = reminderServiceFactory({
    reminderDAL: {
      findDueReminders: async (range: { from: Date; to: Date }) => {
        window = range;
        return opts.due ?? [];
      },
      findByIdForUpdate: async (id: string) => {
        const due = (opts.due ?? []).find((row) => row.id === id);
        if (!due) return undefined;
        return opts.current ? opts.current(due) : due;
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = { id: `tx-${log.length}` };
        log.push("begin");
        const result = await cb(tx);
        log.push("commit");
        return result;
      },
      updateById: async (id: string, data: { nextReminderDate: Date }, tx: unknown) => {
        updates.push({ id, nextReminderDate: data.nextReminderDate, tx });
      },
      deleteById: async (id: string, tx: unknown) => {
        deletes.push({ id, tx });
      }
    },
    eventEmitter: {
      emit: async (
        event: { eventType: string; idempotencyKey?: string; payload: Record<string, unknown> },
        tx: unknown
      ) => {
        if (opts.emitFails?.(event.payload.resourceId as string)) throw new Error("outbox insert failed");
        emitted.push({ ...event, tx });
      }
    },
    alertService: {
      findOrphanedResourceIds: async () => orphanBatches.shift() ?? [],
      deleteAlertsForDeletedResources: async ({ resourceIds }: { resourceIds: string[] }) => {
        reaped.push(resourceIds);
        return resourceIds.length;
      }
    }
  } as never);

  return { service, emitted, updates, deletes, reaped, window: () => window };
};

describe("reminder dispatch", () => {
  const now = new Date("2026-10-10T00:00:05.000Z");

  test("looks back over the catch-up window", async () => {
    const { service, window } = buildService({});
    await service.dispatchDueReminders({ now });
    expect(window()?.from.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(window()?.to.toISOString()).toBe("2026-10-10T23:59:59.999Z");
  });

  test("emits the due event and advances a recurring reminder in the same transaction", async () => {
    const { service, emitted, updates } = buildService({ due: [reminder()] });
    await service.dispatchDueReminders({ now });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      eventType: SECRET_REMINDER_DUE_EVENT,
      idempotencyKey: `${SECRET_REMINDER_DUE_EVENT}:rem-1:2026-10-10`,
      payload: {
        orgId: "org-1",
        projectId: "proj-1",
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceId: "secret-1",
        targetIds: ["secret-1"],
        note: "rotate it",
        repeatDays: 30,
        occurrenceDate: "2026-10-10"
      }
    });
    expect(updates).toEqual([
      { id: "rem-1", nextReminderDate: new Date("2026-11-09T00:00:00.000Z"), tx: emitted[0].tx }
    ]);
  });

  test("deletes a one-time reminder once its event is emitted", async () => {
    const { service, emitted, deletes, updates } = buildService({ due: [reminder({ repeatDays: null })] });
    await service.dispatchDueReminders({ now });

    expect(emitted).toHaveLength(1);
    expect(deletes).toEqual([{ id: "rem-1", tx: emitted[0].tx }]);
    expect(updates).toHaveLength(0);
  });

  test("a caught-up reminder fires once for the day it was due, then resumes its schedule", async () => {
    const { service, emitted, updates } = buildService({
      due: [reminder({ repeatDays: 2, nextReminderDate: new Date("2026-10-05T00:00:00.000Z") })]
    });
    await service.dispatchDueReminders({ now });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.occurrenceDate).toBe("2026-10-05");
    expect(updates[0].nextReminderDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
  });

  test("one failing reminder does not stop the rest, and is left due for the next run", async () => {
    const { service, emitted, updates } = buildService({
      due: [reminder({ id: "rem-1", secretId: "secret-1" }), reminder({ id: "rem-2", secretId: "secret-2" })],
      emitFails: (secretId) => secretId === "secret-1"
    });
    await service.dispatchDueReminders({ now });

    expect(emitted.map((event) => event.payload.resourceId)).toEqual(["secret-2"]);
    expect(updates.map((update) => update.id)).toEqual(["rem-2"]);
  });

  test("skips a reminder cancelled after the due list was read", async () => {
    const { service, emitted, updates, deletes } = buildService({ due: [reminder()], current: () => undefined });
    await service.dispatchDueReminders({ now });
    expect(emitted).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  test("leaves a reminder rescheduled after the due list was read on its new date", async () => {
    const { service, emitted, updates } = buildService({
      due: [reminder()],
      current: (due) => ({ ...due, nextReminderDate: new Date("2026-12-01T00:00:00.000Z") })
    });
    await service.dispatchDueReminders({ now });
    expect(emitted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test("skips a reminder with no secret", async () => {
    const { service, emitted } = buildService({ due: [reminder({ secretId: null })] });
    await service.dispatchDueReminders({ now });
    expect(emitted).toHaveLength(0);
  });
});

describe("orphaned reminder alert reaping", () => {
  test("reaps alerts whose secret is gone, batch by batch", async () => {
    const full = Array.from({ length: 500 }, (_, i) => `secret-${i}`);
    const { service, reaped } = buildService({ orphanBatches: [full, ["secret-last"]] });
    await service.reapOrphanedReminderAlerts();

    expect(reaped).toEqual([full, ["secret-last"]]);
  });

  test("does nothing when there are no orphans", async () => {
    const { service, reaped } = buildService({ orphanBatches: [] });
    await service.reapOrphanedReminderAlerts();
    expect(reaped).toEqual([]);
  });
});

const buildWriteService = (opts: { projectUserIds?: string[]; alertRefusal?: Error } = {}) => {
  const calls: string[] = [];
  // What the reminder asked the alert module to set on its secret.
  const alertRequests: Array<Record<string, unknown>> = [];
  const copied: unknown[] = [];
  const insertedReminders: Record<string, unknown>[] = [];
  const deletedAlerts: Array<{ resourceIds: string[]; tx: unknown }> = [];
  const repointed: Array<{ fromResourceId: string; toResourceId: string; tx: unknown }> = [];

  const reminderTx = { tx: "reminder" };
  const writeTxs: unknown[] = [];

  const service = reminderServiceFactory({
    reminderDAL: {
      transaction: async (cb: (trx: unknown) => unknown) => cb(reminderTx),
      findOne: async () => undefined,
      create: async (data: Record<string, unknown>, trx?: unknown) => {
        calls.push("reminder:create");
        writeTxs.push(trx);
        return { id: "rem-1", ...data };
      },
      updateById: async () => ({}),
      delete: async () => [],
      // A secret id starting "plain-" has no reminder.
      findSecretReminders: async (secretIds: string[]) =>
        secretIds
          .filter((secretId) => !secretId.startsWith("plain-"))
          .map((secretId) => ({ id: `rem-${secretId}`, secretId, repeatDays: 30, message: "rotate it" })),
      insertMany: async (rows: Record<string, unknown>[]) => {
        calls.push("reminder:insert");
        insertedReminders.push(...rows);
        return rows;
      }
    },
    eventEmitter: { emit: async () => {} },
    secretV2BridgeDAL: {
      findOneWithTags: async () => ({
        id: "secret-1",
        key: "DB_PASSWORD",
        projectId: "proj-1",
        folderId: "folder-1",
        tags: []
      }),
      invalidateSecretCacheByProjectId: async () => {},
      // Only the qualified column works against the real query, which joins several tables with an id.
      find: async (filter: { $in: Record<string, string[]> }) =>
        filter.$in["secrets_v2.id"].map((id) => ({ id, projectId: "proj-1" }))
    },
    folderDAL: {
      findSecretPathByFolderIds: async () => [{ id: "folder-1", path: "/", environmentSlug: "dev" }]
    },
    permissionService: {
      getProjectPermission: async () => ({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    },
    alertService: {
      filterRecipientsInScope: async (_scope: unknown, recipients: { principalType: string; principalId: string }[]) =>
        opts.projectUserIds ? recipients.filter((r) => opts.projectUserIds!.includes(r.principalId)) : recipients,
      prepareAlertForResource: async (input: Record<string, unknown>) => {
        if (opts.alertRefusal) throw opts.alertRefusal;
        alertRequests.push(input);
        return {};
      },
      applyPreparedAlert: async (_prepared: unknown, trx: unknown) => {
        calls.push("alert:apply");
        writeTxs.push(trx);
      },
      findRecipientsForResources: async ({ resourceIds }: { resourceIds: string[] }) =>
        resourceIds.map((resourceId) => ({ resourceId, principalId: "user-1" })),
      deleteAlertsForDeletedResources: async ({ resourceIds }: { resourceIds: string[] }, tx?: unknown) => {
        calls.push("alert:delete");
        deletedAlerts.push({ resourceIds, tx });
        return resourceIds.length;
      },
      moveAlertsToResource: async (input: { fromResourceId: string; toResourceId: string }, tx: unknown) => {
        calls.push("alert:move");
        repointed.push({ ...input, tx });
      },
      copyAlertsToResource: async (input: { fromResourceId: string; toResourceId: string }, tx: unknown) => {
        calls.push("alert:copy");
        copied.push({ ...input, tx });
      }
    }
  } as never);

  return { service, calls, alertRequests, deletedAlerts, repointed, copied, insertedReminders, reminderTx, writeTxs };
};

const caller = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null };

const saveReminder = (
  service: ReturnType<typeof buildWriteService>["service"],
  fields: { recipients?: string[] | null; channels?: unknown[] }
) =>
  service.createReminder({
    ...caller,
    reminder: { secretId: "secret-1", repeatDays: 30, message: "rotate it", ...fields }
  } as never);

describe("reminder alert sync", () => {
  test("a new reminder gets an alert with an email channel to its recipients, written as the caller", async () => {
    const { service, alertRequests } = buildWriteService();
    await saveReminder(service, { recipients: ["user-1", "user-2"] });

    expect(alertRequests).toEqual([
      expect.objectContaining({
        name: "Secret reminder",
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceId: "secret-1",
        eventType: SECRET_REMINDER_DUE_EVENT,
        projectId: "proj-1",
        ...caller,
        channels: {
          replaceRecipients: {
            channelType: "email",
            recipients: [
              { principalType: "user", principalId: "user-1" },
              { principalType: "user", principalId: "user-2" }
            ]
          }
        }
      })
    ]);
  });

  test("writes the alert and the reminder in one transaction, so neither exists without the other", async () => {
    const { service, calls, reminderTx, writeTxs } = buildWriteService();
    await saveReminder(service, { recipients: ["user-1"] });
    expect(calls).toEqual(["alert:apply", "reminder:create"]);
    expect(writeTxs).toEqual([reminderTx, reminderTx]);
  });

  test("a refusal from the alert module stops the reminder before anything is written", async () => {
    const { service, calls } = buildWriteService({
      alertRefusal: new Error("An alert can have at most 10 channels, and this would leave it with 11")
    });
    await expect(saveReminder(service, { recipients: ["user-1"] })).rejects.toThrow(/at most 10 channels/);
    expect(calls).toEqual([]);
  });

  test("preparing a reminder writes nothing until it is applied in the caller's transaction", async () => {
    const { service, calls, writeTxs } = buildWriteService();
    const callerTx = { tx: "secret-update" } as never;
    const prepared = await service.prepareReminder({
      ...caller,
      secretKey: "RENAMED",
      reminder: { secretId: "secret-1", repeatDays: 30, recipients: ["user-1"] }
    } as never);
    expect(calls).toEqual([]);

    await service.applyReminder(prepared, callerTx);
    expect(calls).toEqual(["alert:apply", "reminder:create"]);
    expect(writeTxs).toEqual([callerTx, callerTx]);
  });

  test("no recipients means everyone in the project", async () => {
    const { service, alertRequests } = buildWriteService();
    await saveReminder(service, { recipients: [] });
    expect(
      (alertRequests[0].channels as { replaceRecipients: { recipients: unknown } }).replaceRecipients.recipients
    ).toEqual([{ principalType: "project-members", principalId: "proj-1" }]);
  });

  test("recipients who left the project are dropped instead of failing the write", async () => {
    const { service, alertRequests } = buildWriteService({ projectUserIds: ["user-1"] });
    await saveReminder(service, { recipients: ["user-1", "user-gone"] });
    expect(
      (alertRequests[0].channels as { replaceRecipients: { recipients: unknown } }).replaceRecipients.recipients
    ).toEqual([{ principalType: "user", principalId: "user-1" }]);
  });

  test("refuses a recipient list with nobody left in the project rather than sending to everyone", async () => {
    const { service, calls } = buildWriteService({ projectUserIds: [] });
    await expect(saveReminder(service, { recipients: ["user-gone"] })).rejects.toThrow(
      /None of the selected reminder recipients/
    );
    expect(calls).toEqual([]);
  });

  test("given channels, sets them as the alert's complete channel list", async () => {
    const channels = [
      {
        name: "Email",
        channelType: "email",
        recipients: [{ principalType: "group", principalId: "group-1" }]
      },
      { name: "Webhook", channelType: "webhook", config: { url: "https://example.com" } }
    ];
    const { service, alertRequests } = buildWriteService();
    await saveReminder(service, { recipients: ["user-1"], channels });
    expect(alertRequests).toEqual([expect.objectContaining({ channels: { replaceAll: channels } })]);
  });

  test("deleting a reminder by secret also removes its alert inside the caller's transaction", async () => {
    const { service, deletedAlerts } = buildWriteService();
    const tx = { tx: true } as never;
    await service.deleteReminderBySecretId("secret-1", "proj-1", tx);
    expect(deletedAlerts).toEqual([{ resourceIds: ["secret-1"], tx }]);
  });

  test("moving a reminder replaces the destination's reminder and moves the source alert onto it", async () => {
    const { service, calls, deletedAlerts, repointed, insertedReminders } = buildWriteService();
    const tx = { tx: true } as never;
    await service.moveReminders([{ fromSecretId: "secret-src", toSecretId: "secret-dst" }], tx);

    expect(calls).toEqual(["alert:delete", "reminder:insert", "alert:move"]);
    expect(deletedAlerts).toEqual([{ resourceIds: ["secret-dst"], tx }]);
    expect(insertedReminders).toEqual([expect.objectContaining({ secretId: "secret-dst", repeatDays: 30 })]);
    expect(repointed).toEqual([
      { resourceType: SECRET_REMINDER_RESOURCE_TYPE, fromResourceId: "secret-src", toResourceId: "secret-dst", tx }
    ]);
  });

  test("copying a reminder gives the destination a copy of the source alert in the source's project", async () => {
    const { service, calls, repointed, copied } = buildWriteService();
    const tx = { tx: true } as never;
    await service.copyReminders([{ fromSecretId: "secret-src", toSecretId: "secret-dst" }], tx);

    expect(calls).toEqual(["alert:delete", "reminder:insert", "alert:copy"]);
    expect(repointed).toEqual([]);
    expect(copied).toEqual([
      {
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        projectId: "proj-1",
        fromResourceId: "secret-src",
        toResourceId: "secret-dst",
        tx
      }
    ]);
  });

  test("a moved secret with no reminder leaves the destination's reminder alone", async () => {
    const { service, calls } = buildWriteService();
    await service.moveReminders([{ fromSecretId: "plain-src", toSecretId: "secret-dst" }], { tx: true } as never);
    expect(calls).toEqual([]);
  });

  test("dashboard recipients come from the alert, not the old recipients table", async () => {
    const { service } = buildWriteService();
    const reminders = await service.getRemindersForDashboard(["secret-1"]);
    expect(reminders["secret-1"].recipients).toEqual(["user-1"]);
  });
});

describe("deleteRemindersByProjectId", () => {
  test("removes every reminder in the project along with its alerts, in the caller's transaction", async () => {
    const tx = { tx: "org-delete" } as never;
    const deleted: unknown[] = [];
    const reaped: unknown[] = [];
    const invalidated: string[] = [];
    const service = reminderServiceFactory({
      reminderDAL: {
        findSecretIdsByProjectId: async () => ["secret-1", "secret-2"],
        delete: async (filter: unknown, trx: unknown) => {
          deleted.push({ filter, trx });
        }
      },
      alertService: {
        deleteAlertsForDeletedResources: async (input: unknown, trx: unknown) => {
          reaped.push({ input, trx });
        }
      },
      secretV2BridgeDAL: {
        invalidateSecretCacheByProjectId: async (projectId: string) => {
          invalidated.push(projectId);
        }
      }
    } as never);

    await service.deleteRemindersByProjectId("proj-1", tx);

    expect(deleted).toEqual([{ filter: { $in: { secretId: ["secret-1", "secret-2"] } }, trx: tx }]);
    expect(reaped).toEqual([
      {
        input: { resourceType: SECRET_REMINDER_RESOURCE_TYPE, resourceIds: ["secret-1", "secret-2"] },
        trx: tx
      }
    ]);
    expect(invalidated).toEqual(["proj-1"]);
  });
});
