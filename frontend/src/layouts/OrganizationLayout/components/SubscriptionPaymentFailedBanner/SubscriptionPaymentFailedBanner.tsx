import { Link } from "@tanstack/react-router";

import { Button } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";

import { OrgAlertBanner } from "../OrgAlertBanner";

const PAYMENT_ACTION_REQUIRED = "payment_action_required";

// Shown to every member: the billing contact Stripe emails may no longer be in the organization.
export const SubscriptionPaymentFailedBanner = () => {
  const { subscription } = useSubscription();
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();

  const notice = (subscription.notices ?? []).find(
    (candidate) => candidate.type === "subscription_payment_failed"
  );
  if (!notice) return null;

  // Billing lives on the root organization, and a sub-org role grants nothing there.
  const canResolve =
    isRootOrganization &&
    permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing) &&
    permission.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing);

  const message =
    notice.cause === PAYMENT_ACTION_REQUIRED
      ? "Your bank needs to approve the latest subscription payment. Approve it to keep this organization's paid features."
      : "We couldn't collect the latest subscription payment. Update the payment method to keep this organization's paid features.";

  return (
    <OrgAlertBanner
      role="alert"
      isDismissible={false}
      text={
        <>
          <span className="font-medium">Action needed:</span> {message}
          {!canResolve && " Ask an organization admin to update payment."}
        </>
      }
      action={
        canResolve && (
          <Link to="/organizations/$orgId/billing" params={{ orgId: currentOrg.id }}>
            <Button variant="outline" size="xs">
              Review Billing
            </Button>
          </Link>
        )
      }
    />
  );
};
