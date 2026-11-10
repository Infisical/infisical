import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import type { BillingOverview } from "@app/hooks/api/billing/types";

import type { BillingMode, BillingRenderState } from "../billing-view-types";

type BannerProps = {
  mode: BillingMode;
  subState: BillingRenderState;
  canManage: boolean;
  paymentAlert?: BillingOverview["paymentAlert"];
  onUpdatePayment: () => void;
  onManageSubscription: () => void;
};

type Dunning = { tone: "warn" | "bad"; title: string; body: string };

const DUNNING: Partial<Record<BillingRenderState, Dunning>> = {
  "past-due": {
    tone: "warn",
    title: "We couldn't process your last payment",
    body: "Update your payment method to avoid losing access. Your products are still active while we retry."
  },
  suspended: {
    tone: "bad",
    title: "Your subscription is suspended",
    body: "A payment kept failing and access is paused. Complete payment to restore access to your products."
  }
};

const PAYMENT_ALERT: Record<
  NonNullable<BillingOverview["paymentAlert"]>["state"],
  Dunning & { actionLabel: string }
> = {
  needs_action: {
    tone: "warn",
    title: "Your bank needs you to approve a payment",
    body: "Approve the payment to keep your products active.",
    actionLabel: "Approve payment"
  },
  failed: {
    tone: "bad",
    title: "Your last payment failed",
    body: "Pay the open invoice or update your payment method to avoid losing access.",
    actionLabel: "Pay invoice"
  }
};

// A renewal payment alert replaces the generic dunning prompt so a past-due org never sees two
// payment banners. A managed org has no banner; its summary carries the account-team note.
export const Banner = ({
  mode,
  subState,
  canManage,
  paymentAlert,
  onUpdatePayment,
  onManageSubscription
}: BannerProps) => {
  if (mode === "managed") return null;

  if (paymentAlert) {
    // Access is already paused when suspended, so keep that copy and only borrow the payment action.
    const alert =
      subState === "suspended"
        ? { ...PAYMENT_ALERT[paymentAlert.state], ...DUNNING.suspended }
        : PAYMENT_ALERT[paymentAlert.state];
    return (
      <Alert
        tone={alert.tone}
        title={alert.title}
        actions={
          canManage && (
            <Inline gap={8}>
              <Button
                size="sm"
                variant="primary"
                iconRight="external"
                onClick={() => window.open(paymentAlert.actionUrl, "_blank", "noopener,noreferrer")}
              >
                {alert.actionLabel}
              </Button>
              {paymentAlert.state === "failed" && (
                <Button size="sm" variant="outline" onClick={onUpdatePayment}>
                  Update payment method
                </Button>
              )}
            </Inline>
          )
        }
      >
        {alert.body}
      </Alert>
    );
  }

  const dunning = DUNNING[subState];
  if (!dunning) return null;

  return (
    <Alert
      tone={dunning.tone}
      title={dunning.title}
      actions={
        canManage && (
          <Inline gap={8}>
            <Button size="sm" variant="primary" onClick={onUpdatePayment}>
              Update payment method
            </Button>
            <Button size="sm" variant="outline" onClick={onManageSubscription}>
              Manage subscription
            </Button>
          </Inline>
        )
      }
    >
      {dunning.body}
    </Alert>
  );
};
