import { CronJobName } from "@app/lib/cron/cron-job";

// Reached through a path the alias does not match, so this resolves to the real module.
import * as RealCertificateV3Queue from "../../src/services/certificate-v3/certificate-v3-queue";

// Wraps the real certificate auto-renewal queue so a spec can run the daily job on demand instead of
// waiting for midnight. Wired up by test.alias in vitest.e2e.config.mts; nothing under src/ references
// this file.
//
// The job is real: it registers with the server's cron as usual, and the handle below is the very
// handler the cron would call, so the spec runs the same loop, renewal calls and audit events.
//
// The handle hangs off globalThis for the reason given in aws-iam-user-secret-rotation-fns.ts.
const globalScope = globalThis as typeof globalThis & {
  infisicalCertificateAutoRenewalJob?: () => Promise<void>;
};

export const certificateV3QueueServiceFactory: typeof RealCertificateV3Queue.certificateV3QueueServiceFactory = (
  deps
) =>
  RealCertificateV3Queue.certificateV3QueueServiceFactory({
    ...deps,
    cronJob: {
      ...deps.cronJob,
      register: (entry) => {
        // The shared test server boots first. A spec that boots and closes a second server of its own
        // (eg api-run-modes.spec.ts) must not take the handle, or later specs would drive that closed server.
        if (entry.name === CronJobName.CertificateV3AutoRenewal) {
          globalScope.infisicalCertificateAutoRenewalJob ??= entry.handler;
        }
        return deps.cronJob.register(entry);
      }
    }
  });

export const certificateAutoRenewalJob = {
  run: async () => {
    const handler = globalScope.infisicalCertificateAutoRenewalJob;
    if (!handler) throw new Error("The test server has not wired the certificate auto-renewal job yet");
    await handler();
  }
};
