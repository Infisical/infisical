import { QueueJobs } from "@app/queue";

import { signerAutoRenewalQueueFactory } from "./signer-auto-renewal-queue";
import { SignerAutoRenewalOutcome, SignerStatus } from "./signer-enums";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("signer auto-renewal worker", () => {
  it("renews only the active signers inside their renew-before window", async () => {
    let runJob: ((job: { name: string }) => Promise<void>) | undefined;
    const queueService = {
      start: vi.fn((_queue: string, handler: typeof runJob) => {
        runJob = handler;
      }),
      listen: vi.fn()
    };
    const signerDAL = {
      findByStatusWithCertificate: vi.fn().mockResolvedValue([
        { id: "kept", name: "kept", certificateRenewBeforeDays: 20, certificateNotAfter: inDays(30) },
        { id: "due", name: "due", certificateRenewBeforeDays: 20, certificateNotAfter: inDays(5) },
        { id: "off", name: "off", certificateRenewBeforeDays: null, certificateNotAfter: inDays(1) }
      ])
    };
    const signerService = {
      autoRenewCertificate: vi.fn().mockResolvedValue(SignerAutoRenewalOutcome.Renewed),
      syncPendingRevocations: vi.fn()
    };

    signerAutoRenewalQueueFactory({
      queueService,
      cronJob: { register: vi.fn() },
      signerDAL,
      signerService
    } as unknown as Parameters<typeof signerAutoRenewalQueueFactory>[0]);
    await runJob!({ name: QueueJobs.SignerDailyAutoRenewal });

    expect(signerDAL.findByStatusWithCertificate).toHaveBeenCalledWith(SignerStatus.Active);
    expect(signerService.autoRenewCertificate.mock.calls).toEqual([["due"]]);
  });
});
