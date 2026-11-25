import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { format } from "date-fns";

import { Button } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";
import { TrialPaymentFailedNotice } from "@app/hooks/api/subscriptions/types";

import { OrgAlertBanner } from "../OrgAlertBanner";

const PLAN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const PRODUCT_LABELS: Record<string, string> = {
  secrets_management: "Secrets Management",
  cert_management: "Certificate Management",
  pam: "PAM",
  kms: "KMS"
};

const humanizeKey = (key: string) =>
  key
    .replace(/^legacy_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const productLabel = (notice: TrialPaymentFailedNotice) => {
  const product = PRODUCT_LABELS[notice.productKey] ?? humanizeKey(notice.productKey);
  return notice.trialPlanKey ? `${product} ${humanizeKey(notice.trialPlanKey)}` : product;
};

enum NoticeCause {
  PaymentActionRequired = "payment_action_required",
  NoPaymentMethod = "no_payment_method",
  PaymentProcessing = "payment_processing"
}

// The notice doesn't say whether access is already paused (past due vs. unpaid), so the copy promises nothing
// about features; the billing page states that. Only someone who can act is told what to do.
const buildRenewalFailureMessage = (isBankApproval: boolean, canResolve: boolean) => {
  if (isBankApproval) {
    return canResolve
      ? "The bank needs to approve the latest subscription payment. Approve it to complete the payment."
      : "The bank needs to approve the latest subscription payment.";
  }
  return canResolve
    ? "We couldn't collect the latest subscription payment. Update the payment method to resolve it."
    : "We couldn't collect the latest subscription payment.";
};

const listFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const listProducts = (notices: TrialPaymentFailedNotice[]) =>
  listFormatter.format(notices.map(productLabel));

const buildFailureMessage = (notices: TrialPaymentFailedNotice[]) => {
  const products = listProducts(notices);
  const accessEndsAt = format(
    Math.min(...notices.map((notice) => new Date(notice.accessEndsAt).getTime())),
    "MMM d"
  );
  const isUpgradeOnly = notices.every((notice) => notice.trialPlanKey);
  const sharedCause = notices.every((notice) => notice.cause === notices[0].cause)
    ? notices[0].cause
    : undefined;

  const deadline = isUpgradeOnly
    ? `Complete payment before ${accessEndsAt}, or you'll return to your current plan.`
    : `Complete payment before ${accessEndsAt} to keep access.`;

  if (sharedCause === NoticeCause.PaymentActionRequired) {
    return `We couldn't charge your card for ${products}. ${deadline}`;
  }
  if (sharedCause === NoticeCause.NoPaymentMethod) {
    return isUpgradeOnly
      ? `There's no card on file for ${products}. Add one or complete payment before ${accessEndsAt}, or you'll return to your current plan.`
      : `There's no card on file for ${products}. Add one or complete payment before ${accessEndsAt} to keep access.`;
  }
  if (sharedCause === null && isUpgradeOnly) {
    return `We couldn't charge for your ${products} upgrade. ${deadline}`;
  }
  return `We're having trouble completing your ${products} subscription. ${deadline}`;
};

// One banner for every payment the organization has to act on: a failed renewal and trials whose conversion
// charge failed. It reaches every member, since the billing contact Stripe emails may have left.
export const PaymentFailedBanner = () => {
  const { subscription } = useSubscription();
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const location = useLocation();

  useQuery({
    queryKey: subscriptionQueryKeys.getOrgSubsription(currentOrg.id),
    queryFn: () => fetchOrgSubscription(currentOrg.id),
    refetchInterval: PLAN_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true
  });

  const allNotices = subscription.notices ?? [];
  const now = Date.now();
  // The plan is cached server-side, so a notice can outlive its deadline by a few minutes.
  const trialNotices = allNotices.filter(
    (notice): notice is TrialPaymentFailedNotice =>
      notice.type === "trial_payment_failed" && new Date(notice.accessEndsAt).getTime() > now
  );
  const renewalNotice = allNotices.find((notice) => notice.type === "subscription_payment_failed");
  if (!trialNotices.length && !renewalNotice) return null;

  const canReadBilling = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );
  const processingNotices = trialNotices.filter(
    (notice) => notice.cause === NoticeCause.PaymentProcessing
  );
  const failedTrialNotices = trialNotices.filter(
    (notice) => notice.cause !== NoticeCause.PaymentProcessing
  );
  const processingMessage = processingNotices.length
    ? `Your payment for ${listProducts(processingNotices)} is processing. Access continues meanwhile.`
    : null;

  const isBillingPage = location.pathname === `/organizations/${currentOrg.id}/billing`;
  if (isBillingPage && isRootOrganization && canReadBilling) {
    return (
      processingMessage && (
        <OrgAlertBanner role="status" isDismissible={false} text={processingMessage} />
      )
    );
  }

  // Billing lives on the root organization, and a sub-org role grants nothing there.
  const canResolve =
    isRootOrganization &&
    canReadBilling &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);

  const isBankApproval = renewalNotice?.cause === NoticeCause.PaymentActionRequired;
  const failureMessages: string[] = [];
  if (renewalNotice) {
    failureMessages.push(buildRenewalFailureMessage(isBankApproval, canResolve));
  }
  if (failedTrialNotices.length) {
    failureMessages.push(buildFailureMessage(failedTrialNotices));
  }

  if (!failureMessages.length) {
    return <OrgAlertBanner role="status" isDismissible={false} text={processingMessage} />;
  }

  const askAdminMessage =
    isBankApproval && !failedTrialNotices.length
      ? "Ask an organization admin to approve it."
      : "Ask an organization admin to update payment.";
  // Paying a trial again while its payment settles could charge twice.
  const canPayTrial = failedTrialNotices.length > 0 && !processingNotices.length;
  const showAction = canResolve && (Boolean(renewalNotice) || canPayTrial);

  return (
    <OrgAlertBanner
      role="alert"
      isDismissible={false}
      text={
        <>
          <span className="font-medium">Action needed:</span> {failureMessages.join(" ")}
          {processingMessage && ` ${processingMessage}`}
          {!canResolve && ` ${askAdminMessage}`}
        </>
      }
      action={
        showAction && (
          <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
            <Button variant="outline" size="xs">
              {renewalNotice ? "Review Billing" : "Complete Payment"}
            </Button>
          </Link>
        )
      }
    />
  );
};
