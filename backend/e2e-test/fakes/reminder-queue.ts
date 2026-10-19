import type { TReminderServiceFactory } from "@app/services/reminder/reminder-types";

// Reached through a path the alias does not match, so this resolves to the real module.
import * as RealReminderQueue from "../../src/services/reminder/reminder-queue";

// Wraps the real daily reminder job so a spec can run it on demand instead of waiting for the cron.
// Wired up by test.alias in vitest.e2e.config.mts; nothing under src/ references this file.
//
// The job is real: it registers with the server's cron as usual, and the handle below calls the same
// reminder service the handler does, wired with the server's own dependencies. Only the trigger
// changes, and the spec can pass the day to run for instead of waiting for it.
//
// The handle hangs off globalThis for the reason given in aws-parameter-store-sync-fns.ts: the
// server and a spec reach this module by different specifiers and get separate copies of it.
const globalScope = globalThis as typeof globalThis & {
  infisicalReminderService?: TReminderServiceFactory;
};

export const dailyReminderQueueServiceFactory: typeof RealReminderQueue.dailyReminderQueueServiceFactory = (deps) => {
  // The shared test server boots first. A spec that boots and closes a second server of its own (eg
  // api-run-modes.spec.ts) must not take the handle, or later specs would drive that closed server.
  globalScope.infisicalReminderService ??= deps.reminderService;
  return RealReminderQueue.dailyReminderQueueServiceFactory(deps);
};

const reminderService = () => {
  const service = globalScope.infisicalReminderService;
  if (!service) throw new Error("The test server has not wired the daily reminder job yet");
  return service;
};

export const dailyReminderJob = {
  dispatchDueReminders: (opts: { now: Date }) => reminderService().dispatchDueReminders(opts),
  reapOrphanedReminderAlerts: () => reminderService().reapOrphanedReminderAlerts()
};
