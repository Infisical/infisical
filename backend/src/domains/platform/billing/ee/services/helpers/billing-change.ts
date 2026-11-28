import { RuleViolationError } from "@app/domains/lib/errors";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { logger } from "@app/lib/logger";

import { PaymentLink } from "../../models/payment-link";

// The bank wants the customer to approve the charge on the Stripe invoice; the change settles by webhook once they
// do, so the plan is revalidated over the longer checkout window. Without a usable link there is nothing to send them
// to, so it fails with the same code as a declined charge, which points them at the billing portal.
export const settlePaymentAction = async (
  licenseService: TLicenseService,
  { orgId, paymentUrl }: { orgId: string; paymentUrl: string | undefined }
) => {
  const url = PaymentLink.httpsOrNull(paymentUrl);
  if (!url) {
    logger.error(`billing-v2: payment_action_required without a usable paymentUrl [orgId=${orgId}]`);
    throw new RuleViolationError({
      message:
        "Your bank needs you to approve this payment, but we couldn't get the approval link. Open the billing portal to complete it.",
      details: { code: "payment_action_required" }
    });
  }
  await licenseService.refreshPlan(orgId, { afterBillingChange: { checkout: true } });
  return { outcome: "payment_action_required" as const, paymentUrl: url };
};
