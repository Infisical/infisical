import {
  CircleAlert,
  CreditCard,
  ExternalLink,
  Info,
  type LucideIcon,
  TriangleAlert
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { BillingV2Overview } from "@app/hooks/api";

import { BillingV2Mode, BillingV2RenderState } from "../billing-v2-view-types";

type BannerProps = {
  mode: BillingV2Mode;
  subState: BillingV2RenderState;
  canManage: boolean;
  paymentAlert?: BillingV2Overview["paymentAlert"];
  onUpdatePayment: () => void;
  onManageSubscription: () => void;
};

type Dunning = {
  variant: "warning" | "danger";
  icon: LucideIcon;
  title: string;
  body: string;
};

const DUNNING: Partial<Record<BillingV2RenderState, Dunning>> = {
  "past-due": {
    variant: "warning",
    icon: TriangleAlert,
    title: "We couldn't process your last payment",
    body: "Update your payment method to avoid losing access. Your products are still active while we retry."
  },
  suspended: {
    variant: "danger",
    icon: CircleAlert,
    title: "Your subscription is suspended",
    body: "A payment kept failing and access is paused. Complete payment to restore access to your products."
  }
};

const PAYMENT_ALERT: Record<
  NonNullable<BillingV2Overview["paymentAlert"]>["state"],
  Dunning & { actionLabel: string }
> = {
  needs_action: {
    variant: "warning",
    icon: TriangleAlert,
    title: "Your bank needs you to approve your renewal payment",
    body: "Approve the payment to keep your products active.",
    actionLabel: "Approve Payment"
  },
  failed: {
    variant: "danger",
    icon: CircleAlert,
    title: "Your last payment failed",
    body: "Pay the open invoice or update your payment method to avoid losing access.",
    actionLabel: "Pay Invoice"
  }
};

// Top-of-page notice: a managed org shows the "managed by your account team" note; a self-serve org in
// dunning (past-due / suspended) shows a payment-recovery prompt. A renewal payment alert replaces the
// generic dunning prompt so a past-due org never sees two payment banners. Nothing otherwise.
export const Banner = ({
  mode,
  subState,
  canManage,
  paymentAlert,
  onUpdatePayment,
  onManageSubscription
}: BannerProps) => {
  if (mode === "managed") {
    return (
      <Alert variant="info">
        <Info />
        <AlertTitle>Your plan is managed by your account team</AlertTitle>
        <AlertDescription>
          Products and limits on this organization are set by contract. Contact your account manager
          to make changes.
        </AlertDescription>
      </Alert>
    );
  }

  if (paymentAlert) {
    // Access is already paused when suspended, so keep that copy and only borrow the payment action.
    const alert =
      subState === "suspended"
        ? { ...PAYMENT_ALERT[paymentAlert.state], ...DUNNING.suspended }
        : PAYMENT_ALERT[paymentAlert.state];
    const AlertIcon = alert.icon;
    return (
      <Alert variant={alert.variant}>
        <AlertIcon />
        <AlertTitle>{alert.title}</AlertTitle>
        <AlertDescription>
          {alert.body}
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={alert.variant}
                size="sm"
                onClick={() => window.open(paymentAlert.actionUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink />
                {alert.actionLabel}
              </Button>
              {paymentAlert.state === "failed" && (
                <Button variant="outline" size="sm" onClick={onUpdatePayment}>
                  <CreditCard />
                  Update Payment Method
                </Button>
              )}
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const dunning = DUNNING[subState];
  if (!dunning) {
    return null;
  }

  const DunningIcon = dunning.icon;
  return (
    <Alert variant={dunning.variant}>
      <DunningIcon />
      <AlertTitle>{dunning.title}</AlertTitle>
      <AlertDescription>
        {dunning.body}
        {canManage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={dunning.variant} size="sm" onClick={onUpdatePayment}>
              <CreditCard />
              Update payment method
            </Button>
            <Button variant="outline" size="sm" onClick={onManageSubscription}>
              Manage subscription
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
