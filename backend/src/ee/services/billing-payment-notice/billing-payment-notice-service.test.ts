import { OrgMembershipStatus } from "@app/db/schemas";
import { TPaymentFailure } from "@app/domains/platform/license/ce/module";
import { SmtpTemplates, TSmtpSendMail } from "@app/services/smtp/smtp-service";

import { billingPaymentNoticeServiceFactory } from "./billing-payment-notice-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    SITE_URL: "https://app.infisical.com",
    isCloud: true,
    isSecondaryInstance: false
  })
}));

const ORG_ID = "org-root";
const NOW = new Date("2026-11-25T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const admin = (email: string, status = OrgMembershipStatus.Accepted, isActive = true) => ({
  status,
  user: { email, isActive }
});

const failure = (overrides: Partial<TPaymentFailure> = {}): TPaymentFailure => ({
  orgId: ORG_ID,
  invoiceId: "in_1",
  needsAction: false,
  since: NOW.toISOString(),
  ...overrides
});

const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

const build = (failures: TPaymentFailure[], admins = [admin("a@acme.com"), admin("b@acme.com")]) => {
  const markers = new Set<string>();
  const keyStore = {
    setItemWithExpiryNX: vi.fn(async (key: string) => {
      if (markers.has(key)) return null;
      markers.add(key);
      return "OK" as const;
    }),
    deleteItem: vi.fn(async (key: string) => (markers.delete(key) ? 1 : 0))
  };
  const licenseBilling = {
    isEnabled: () => true,
    listPaymentFailures: vi.fn(async () => failures)
  };
  const orgDAL = {
    findOrgById: vi.fn(async (orgId: string) => (orgId === ORG_ID ? { id: ORG_ID, name: "Acme" } : undefined)),
    findOrgMembersByRole: vi.fn(async () => admins)
  };
  const smtpService = {
    sendMail: vi.fn<(mail: TSmtpSendMail) => Promise<void>>(async () => {})
  };
  const cronJob = { register: vi.fn() };
  const service = billingPaymentNoticeServiceFactory({
    licenseBilling,
    orgDAL: orgDAL as never,
    smtpService,
    keyStore,
    cronJob
  });
  return { service, smtpService, keyStore, cronJob, licenseBilling };
};

describe("billingPaymentNoticeService.notifyPaymentFailures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should email the org's active admins once for a new failure", async () => {
    // Setup
    const { service, smtpService } = build(
      [failure()],
      [
        admin("a@acme.com"),
        admin("invited@acme.com", OrgMembershipStatus.Invited),
        admin("off@acme.com", OrgMembershipStatus.Accepted, false)
      ]
    );

    // Action
    await service.notifyPaymentFailures();
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail).toHaveBeenCalledTimes(1);
    const [[mail]] = smtpService.sendMail.mock.calls;
    expect(mail.template).toBe(SmtpTemplates.BillingPaymentFailed);
    expect(mail.subjectLine).toBe("Payment Failed for Your Infisical Subscription");
    expect(mail.recipients).toEqual(["a@acme.com"]);
    expect(mail.substitutions).toMatchObject({
      orgName: "Acme",
      url: `https://app.infisical.com/organizations/${ORG_ID}/billing`,
      needsAction: false,
      isFinalReminder: false
    });
  });

  test.each([
    {
      days: 2,
      subjectLine: "Payment Failed for Your Infisical Subscription",
      isFinalReminder: false
    },
    {
      days: 3,
      subjectLine: "Reminder: Payment Failed for Your Infisical Subscription",
      isFinalReminder: false
    },
    {
      days: 30,
      subjectLine: "Final Reminder: Payment Failed for Your Infisical Subscription",
      isFinalReminder: true
    }
  ])(
    "should send only the stage a $days day old failure has reached",
    async ({ days, subjectLine, isFinalReminder }) => {
      // Setup
      const { service, smtpService } = build([failure({ since: daysAgo(days) })]);

      // Action
      await service.notifyPaymentFailures();

      // Assert
      expect(smtpService.sendMail).toHaveBeenCalledTimes(1);
      expect(smtpService.sendMail.mock.calls[0][0]).toMatchObject({
        subjectLine,
        substitutions: { isFinalReminder }
      });
    }
  );

  test("should send the next stage once the failure is old enough", async () => {
    // Setup
    const { service, smtpService } = build([failure({ since: daysAgo(0) })]);
    await service.notifyPaymentFailures();

    // Action
    vi.setSystemTime(new Date(NOW.getTime() + 3 * DAY_MS));
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail.mock.calls.map(([mail]) => mail.subjectLine)).toEqual([
      "Payment Failed for Your Infisical Subscription",
      "Reminder: Payment Failed for Your Infisical Subscription"
    ]);
  });

  test("should email again when a later invoice fails", async () => {
    // Setup
    const { service, smtpService, licenseBilling } = build([failure()]);
    await service.notifyPaymentFailures();

    // Action
    licenseBilling.listPaymentFailures.mockResolvedValueOnce([failure({ invoiceId: "in_2" })]);
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail).toHaveBeenCalledTimes(2);
  });

  test("should retry on the next run when the email fails to send", async () => {
    // Setup
    const { service, smtpService } = build([failure()]);
    smtpService.sendMail.mockRejectedValueOnce(new Error("smtp down"));

    // Action
    await service.notifyPaymentFailures();
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail).toHaveBeenCalledTimes(2);
  });

  test("should skip an org this instance does not hold and keep notifying the rest", async () => {
    // Setup
    const { service, smtpService } = build([failure({ orgId: "org-other-region" }), failure()]);

    // Action
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail).toHaveBeenCalledTimes(1);
  });

  test("should not email when the org has no active admin", async () => {
    // Setup
    const { service, smtpService } = build([failure()], [admin("invited@acme.com", OrgMembershipStatus.Invited)]);

    // Action
    await service.notifyPaymentFailures();

    // Assert
    expect(smtpService.sendMail).not.toHaveBeenCalled();
  });
});

describe("billingPaymentNoticeService.init", () => {
  test("should register the daily job on a cloud instance", () => {
    // Setup
    const { service, cronJob } = build([]);

    // Action
    service.init();

    // Assert
    expect(cronJob.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "billing-payment-failure-notice",
        pattern: "7 15 * * *",
        enabled: true
      })
    );
  });
});
