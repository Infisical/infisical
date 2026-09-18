import { CircleAlert, CreditCard, Info, type LucideIcon, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";

import { BillingV2Mode, BillingV2RenderState } from "../billing-v2-view-types";

type BannerProps = {
  mode: BillingV2Mode;
  subState: BillingV2RenderState;
  canManage: boolean;
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

// Top-of-page notice: a managed org shows the "managed by your account team" note; a self-serve org in
// dunning (past-due / suspended) shows a payment-recovery prompt. Nothing otherwise.
export const Banner = ({
  mode,
  subState,
  canManage,
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
