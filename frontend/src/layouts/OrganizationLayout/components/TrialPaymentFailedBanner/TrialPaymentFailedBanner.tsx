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

const listFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const buildMessage = (notices: SubscriptionPlanNotice[]) => {
  const products = listFormatter.format(notices.map(productLabel));
  const accessEndsAt = format(
    Math.min(...notices.map((notice) => new Date(notice.accessEndsAt).getTime())),
    "MMM d"
  );
  const isUpgradeOnly = notices.every((notice) => notice.trialPlanKey);

  return isUpgradeOnly
    ? `Your ${products} upgrade will end on ${accessEndsAt} due to a failed payment.`
    : `${products} access will be suspended on ${accessEndsAt} due to a failed payment.`;
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

  // Billing lives on the root organization, and a sub-org role grants nothing there.
  const canResolve =
    isRootOrganization &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);
  return (
    <OrgAlertBanner
      role="alert"
      isDismissible={false}
      text={
        <>
          <span className="font-medium">Action needed:</span> {buildMessage(notices)}
          {!canResolve && " Ask an organization admin to update payment."}
        </>
      }
      action={
        canResolve && (
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
