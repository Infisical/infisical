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
      },
      findOrphanedReminderAlertResourceIds: async () => orphanBatches.shift() ?? []
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
      idempotencyKey: `${SECRET_REMINDER_DUE_EVENT}:secret-1:2026-10-10`,
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

type TStoredAlert = {
  id: string;
  name: string;
  resourceId: string;
  channels: Array<{
    id: string;
    name: string;
    channelType: string;
    enabled: boolean;
    recipients: { principalType: string; principalId: string }[];
  }>;
};

const buildWriteService = (opts: { existingAlert?: TStoredAlert; projectUserIds?: string[] } = {}) => {
  const calls: string[] = [];
  const created: unknown[] = [];
  const updated: Array<{ alertId: string; name?: string; channels?: unknown[] }> = [];
  const deletedAlerts: Array<{ resourceIds: string[]; tx: unknown }> = [];
  const repointed: Array<{ fromResourceId: string; toResourceId: string; tx: unknown }> = [];

  const service = reminderServiceFactory({
    reminderDAL: {
      findOne: async () => undefined,
      create: async (data: Record<string, unknown>) => {
        calls.push("reminder:create");
        return { id: "rem-1", ...data };
      },
      updateById: async () => ({}),
      delete: async () => [],
      findSecretReminders: async (secretIds: string[]) =>
        secretIds.map((secretId) => ({ id: `rem-${secretId}`, secretId, recipients: ["stale-user"] }))
    },
    eventEmitter: { emit: async () => {} },
    projectDAL: { findById: async () => ({ id: "proj-1", orgId: "org-1" }) },
    secretV2BridgeDAL: {
      findOneWithTags: async () => ({ id: "secret-1", key: "DB_PASSWORD", projectId: "proj-1" }),
      invalidateSecretCacheByProjectId: async () => {}
    },
    alertService: {
      filterRecipientsInScope: async (_scope: unknown, recipients: { principalType: string; principalId: string }[]) =>
        opts.projectUserIds ? recipients.filter((r) => opts.projectUserIds!.includes(r.principalId)) : recipients,
      findAlertsForResources: async () => (opts.existingAlert ? [opts.existingAlert] : []),
      createAlertInternal: async (input: unknown) => {
        calls.push("alert:create");
        created.push(input);
        return input;
      },
      updateAlertInternal: async (input: { alertId: string; name?: string; channels?: unknown[] }) => {
        calls.push("alert:update");
        updated.push(input);
        return input;
      },
      findRecipientsForResources: async ({ resourceIds }: { resourceIds: string[] }) =>
        resourceIds.map((resourceId) => ({ resourceId, principalId: "user-1" })),
      deleteAlertsForDeletedResources: async ({ resourceIds }: { resourceIds: string[] }, tx?: unknown) => {
        calls.push("alert:delete");
        deletedAlerts.push({ resourceIds, tx });
        return resourceIds.length;
      },
      repointAlertsForResource: async (input: { fromResourceId: string; toResourceId: string }, tx: unknown) => {
        calls.push("alert:repoint");
        repointed.push({ ...input, tx });
      }
    }
  } as never);

  return { service, calls, created, updated, deletedAlerts, repointed };
};

const createInput = (recipients?: string[] | null) => ({
  secretId: "secret-1",
  projectId: "proj-1",
  repeatDays: 30,
  message: "rotate it",
  recipients
});

describe("reminder alert sync", () => {
  test("a new reminder gets an alert with an email channel to its recipients, created by the platform", async () => {
    const { service, created } = buildWriteService();
    await service.createReminderInternal(createInput(["user-1", "user-2"]));

    expect(created).toEqual([
      expect.objectContaining({
        name: "Reminder for DB_PASSWORD",
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceId: "secret-1",
        eventType: SECRET_REMINDER_DUE_EVENT,
        orgId: "org-1",
        projectId: "proj-1",
        createdBy: { actorType: "platform", actorId: null },
        channels: [
          {
            name: "Email",
            channelType: "email",
            recipients: [
              { principalType: "user", principalId: "user-1" },
              { principalType: "user", principalId: "user-2" }
            ]
          }
        ]
      })
    ]);
  });

  test("syncs the alert before writing the reminder, so a reminder never exists without one", async () => {
    const { service, calls } = buildWriteService();
    await service.createReminderInternal(createInput(["user-1"]));
    expect(calls).toEqual(["alert:create", "reminder:create"]);
  });

  test("no recipients means everyone in the project", async () => {
    const { service, created } = buildWriteService();
    await service.createReminderInternal(createInput([]));
    expect((created[0] as { channels: { recipients: unknown }[] }).channels[0].recipients).toEqual([
      { principalType: "project-members", principalId: "proj-1" }
    ]);
  });

  test("recipients who left the project are dropped instead of failing the write", async () => {
    const { service, created } = buildWriteService({ projectUserIds: ["user-1"] });
    await service.createReminderInternal(createInput(["user-1", "user-gone"]));
    expect((created[0] as { channels: { recipients: unknown }[] }).channels[0].recipients).toEqual([
      { principalType: "user", principalId: "user-1" }
    ]);
  });

  test("falls back to everyone when every listed recipient has left", async () => {
    const { service, created } = buildWriteService({ projectUserIds: [] });
    await service.createReminderInternal(createInput(["user-gone"]));
    expect((created[0] as { channels: { recipients: unknown }[] }).channels[0].recipients).toEqual([
      { principalType: "project-members", principalId: "proj-1" }
    ]);
  });

  test("more than 20 recipients are split across email channels", async () => {
    const { service, created } = buildWriteService();
    await service.createReminderInternal(createInput(Array.from({ length: 45 }, (_, i) => `user-${i}`)));
    const { channels } = created[0] as { channels: { name: string; recipients: unknown[] }[] };
    expect(channels.map((c) => c.name)).toEqual(["Email", "Email 2", "Email 3"]);
    expect(channels.map((c) => c.recipients.length)).toEqual([20, 20, 5]);
  });

  test("updating keeps Slack, webhook and PagerDuty channels and reuses the email channel", async () => {
    const { service, updated, created } = buildWriteService({
      existingAlert: {
        id: "alert-1",
        name: "Reminder for OLD_NAME",
        resourceId: "secret-1",
        channels: [
          { id: "ch-email", name: "Team email", channelType: "email", enabled: true, recipients: [] },
          { id: "ch-hook", name: "Webhook", channelType: "webhook", enabled: false, recipients: [] }
        ]
      }
    });
    await service.createReminderInternal(createInput(["user-1"]));

    expect(created).toHaveLength(0);
    expect(updated).toEqual([
      {
        alertId: "alert-1",
        name: "Reminder for DB_PASSWORD",
        channels: [
          {
            id: "ch-email",
            name: "Team email",
            channelType: "email",
            recipients: [{ principalType: "user", principalId: "user-1" }]
          },
          { id: "ch-hook", name: "Webhook", channelType: "webhook", enabled: false }
        ]
      }
    ]);
  });

  test("deleting a reminder by secret also removes its alert inside the caller's transaction", async () => {
    const { service, deletedAlerts } = buildWriteService();
    const tx = { tx: true } as never;
    await service.deleteReminderBySecretId("secret-1", "proj-1", tx);
    expect(deletedAlerts).toEqual([{ resourceIds: ["secret-1"], tx }]);
  });

  test("moving reminders clears the destination's alert, then moves the source alert onto it", async () => {
    const { service, calls, deletedAlerts, repointed } = buildWriteService();
    const tx = { tx: true } as never;
    await service.moveReminderAlerts([{ fromSecretId: "secret-src", toSecretId: "secret-dst" }], tx);

    expect(calls).toEqual(["alert:delete", "alert:repoint"]);
    expect(deletedAlerts).toEqual([{ resourceIds: ["secret-dst"], tx }]);
    expect(repointed).toEqual([
      { resourceType: SECRET_REMINDER_RESOURCE_TYPE, fromResourceId: "secret-src", toResourceId: "secret-dst", tx }
    ]);
  });

  test("dashboard recipients come from the alert, not the old recipients table", async () => {
    const { service } = buildWriteService();
    const reminders = await service.getRemindersForDashboard(["secret-1"]);
    expect(reminders["secret-1"].recipients).toEqual(["user-1"]);
  });
});
