import { randomUUID } from "node:crypto";

import { AuditLogEntry } from "../models/audit-log-entry";
import { AuditLogPolicy } from "../models/audit-log-policy";
import type { TAuditLogBuffer } from "../services/dependencies";
import { managementEvent, platformActorRecord } from "./audit-events";

type TSetup = () => Promise<{ buffer: TAuditLogBuffer }>;

const entry = (): AuditLogEntry =>
  AuditLogEntry.create({
    id: randomUUID(),
    orgId: randomUUID(),
    actor: platformActorRecord(),
    event: managementEvent(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    policy: AuditLogPolicy.create({ retentionDays: 30 })
  })!;

const appendAll = async (buffer: TAuditLogBuffer, entries: AuditLogEntry[]) => {
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await buffer.append(e);
  }
};

const idsOf = (collected: { entries: { data: string }[] }) =>
  collected.entries.map((e) => (JSON.parse(e.data) as { id: string }).id);

export const describeAuditLogBufferContract = (name: string, setup: TSetup) => {
  describe(`${name} audit log buffer contract`, () => {
    test("should return entries in the order they were appended", async () => {
      // Setup
      const { buffer } = await setup();
      const entries = [entry(), entry(), entry()];
      await appendAll(buffer, entries);

      // Action
      const collected = await buffer.collect({ batchSize: 100, maxEntries: 100 });

      // Assert
      expect(idsOf(collected)).toEqual(entries.map((e) => e.toJSON().id));
      expect(collected.lastStreamId).toBe(collected.entries[2].streamId);
    });

    test("should collect nothing and no last id when the buffer is empty", async () => {
      // Setup
      const { buffer } = await setup();

      // Action
      const collected = await buffer.collect({ batchSize: 100, maxEntries: 100 });

      // Assert
      expect(collected.entries).toEqual([]);
      expect(collected.lastStreamId).toBeNull();
    });

    test("should cap a collect at the ceiling when more is buffered", async () => {
      // Setup
      const { buffer } = await setup();
      const entries = [entry(), entry(), entry(), entry(), entry()];
      await appendAll(buffer, entries);

      // Action
      const collected = await buffer.collect({ batchSize: 2, maxEntries: 4 });

      // Assert
      expect(idsOf(collected)).toEqual(entries.slice(0, 4).map((e) => e.toJSON().id));
    });

    test("should drop entries up to and including the given id and keep later ones when trimmed", async () => {
      // Setup
      const { buffer } = await setup();
      const entries = [entry(), entry(), entry()];
      await appendAll(buffer, entries);
      const first = await buffer.collect({ batchSize: 100, maxEntries: 100 });

      // Action
      await buffer.trimThrough(first.entries[1].streamId);

      // Assert
      const rest = await buffer.collect({ batchSize: 100, maxEntries: 100 });
      expect(idsOf(rest)).toEqual([entries[2].toJSON().id]);
    });

    test("should refuse a second holder of the drain lock while the first holds it", async () => {
      // Setup
      const { buffer } = await setup();
      let innerRan = false;
      let innerResult: boolean | undefined;

      // Action
      const outerResult = await buffer.whileHoldingDrainLock(async () => {
        innerResult = await buffer.whileHoldingDrainLock(async () => {
          innerRan = true;
        });
      });

      // Assert
      expect(outerResult).toBe(true);
      expect(innerResult).toBe(false);
      expect(innerRan).toBe(false);
    });

    test("should free the drain lock again after the work, even when it throws", async () => {
      // Setup
      const { buffer } = await setup();
      await expect(
        buffer.whileHoldingDrainLock(async () => {
          throw new Error("drain failed");
        })
      ).rejects.toThrow("drain failed");

      // Action
      let ran = false;
      const result = await buffer.whileHoldingDrainLock(async () => {
        ran = true;
      });

      // Assert
      expect(result).toBe(true);
      expect(ran).toBe(true);
    });
  });
};
