import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { Button } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { SubscriptionPlanNotice } from "@app/hooks/api/subscriptions/types";

import { OrgAlertBanner } from "../OrgAlertBanner";

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

const productLabel = (notice: SubscriptionPlanNotice) => {
  const product = PRODUCT_LABELS[notice.productKey] ?? humanizeKey(notice.productKey);
  return notice.trialPlanKey ? `${product} ${humanizeKey(notice.trialPlanKey)}` : product;
};

enum NoticeCause {
  PaymentActionRequired = "payment_action_required",
  NoPaymentMethod = "no_payment_method",
  PaymentProcessing = "payment_processing"
}

const listFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const listProducts = (notices: SubscriptionPlanNotice[]) =>
  listFormatter.format(notices.map(productLabel));

const buildFailureMessage = (notices: SubscriptionPlanNotice[]) => {
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

export const TrialPaymentFailedBanner = () => {
  const { subscription } = useSubscription();
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();

  const now = Date.now();
  // The plan is cached server-side, so a notice can outlive its deadline by a few minutes.
  const notices = (subscription.notices ?? []).filter(
    (notice) =>
      notice.type === "trial_payment_failed" && new Date(notice.accessEndsAt).getTime() > now
  );
  if (!notices.length) return null;

  const processingNotices = notices.filter(
    (notice) => notice.cause === NoticeCause.PaymentProcessing
  );
  const failedNotices = notices.filter((notice) => notice.cause !== NoticeCause.PaymentProcessing);
  const processingMessage = processingNotices.length
    ? `Your payment for ${listProducts(processingNotices)} is processing. Access continues meanwhile.`
    : null;

  // Billing lives on the root organization, and a sub-org role grants nothing there.
  const canResolve =
    isRootOrganization &&
    permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing) &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);
  // Paying again while a payment settles could charge twice.
  const showPayButton = canResolve && failedNotices.length > 0 && !processingNotices.length;

  if (!failedNotices.length) {
    return <OrgAlertBanner role="status" isDismissible={false} text={processingMessage} />;
  }

  return (
    <OrgAlertBanner
      role="alert"
      isDismissible={false}
      text={
        <>
          <span className="font-medium">Action needed:</span> {buildFailureMessage(failedNotices)}
          {processingMessage && ` ${processingMessage}`}
          {!canResolve && " Ask an organization admin to update payment."}
        </>
      }
      action={
        showPayButton && (
          <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
            <Button variant="outline" size="xs">
              Complete Payment
            </Button>
          </Link>
        )
      }
    />
  );
};
