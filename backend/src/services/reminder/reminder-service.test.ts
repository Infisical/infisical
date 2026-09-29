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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T00:00:05.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("looks back over the catch-up window", async () => {
    const { service, window } = buildService({});
    await service.dispatchDueReminders();
    expect(window()?.from.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(window()?.to.toISOString()).toBe("2026-10-10T23:59:59.999Z");
  });

  test("emits the due event and advances a recurring reminder in the same transaction", async () => {
    const { service, emitted, updates } = buildService({ due: [reminder()] });
    await service.dispatchDueReminders();

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
    await service.dispatchDueReminders();

    expect(emitted).toHaveLength(1);
    expect(deletes).toEqual([{ id: "rem-1", tx: emitted[0].tx }]);
    expect(updates).toHaveLength(0);
  });

  test("a caught-up reminder fires once for the day it was due, then resumes its schedule", async () => {
    const { service, emitted, updates } = buildService({
      due: [reminder({ repeatDays: 2, nextReminderDate: new Date("2026-10-05T00:00:00.000Z") })]
    });
    await service.dispatchDueReminders();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.occurrenceDate).toBe("2026-10-05");
    expect(updates[0].nextReminderDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
  });

  test("one failing reminder does not stop the rest, and is left due for the next run", async () => {
    const { service, emitted, updates } = buildService({
      due: [reminder({ id: "rem-1", secretId: "secret-1" }), reminder({ id: "rem-2", secretId: "secret-2" })],
      emitFails: (secretId) => secretId === "secret-1"
    });
    await service.dispatchDueReminders();

    expect(emitted.map((event) => event.payload.resourceId)).toEqual(["secret-2"]);
    expect(updates.map((update) => update.id)).toEqual(["rem-2"]);
  });

  test("skips a reminder with no secret", async () => {
    const { service, emitted } = buildService({ due: [reminder({ secretId: null })] });
    await service.dispatchDueReminders();
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
