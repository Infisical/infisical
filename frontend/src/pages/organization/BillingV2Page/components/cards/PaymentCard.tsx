import { CreditCard } from "lucide-react";

import { Button, Card, CardAction, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import { BillingV2Overview } from "@app/hooks/api";

import { CardEmpty } from "../shared";

type PaymentCardProps = {
  overview: BillingV2Overview;
  canManage: boolean;
  onUpdate: () => void;
};

export const PaymentCard = ({ overview, canManage, onUpdate }: PaymentCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <CreditCard className="size-4 text-accent" />
        Payment Method
      </CardTitle>
      {canManage && (
        <CardAction>
          <Button variant="outline" size="sm" onClick={onUpdate}>
            Update
          </Button>
        </CardAction>
      )}
    </CardHeader>
    <CardContent>
      {overview.payment ? (
        <div className="flex items-center gap-3.5">
          <div className="flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-sm border border-border bg-container text-[10px] font-bold tracking-wide text-foreground">
            {overview.payment.brand.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {overview.payment.brand.toUpperCase()} ending in {overview.payment.last4}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Expires {String(overview.payment.expMonth).padStart(2, "0")} /{" "}
              {String(overview.payment.expYear).slice(-2)}
            </div>
          </div>
        </div>
      ) : (
        <CardEmpty
          title="No payment method"
          description="You haven't added a payment method yet."
        />
      )}
    </CardContent>
  </Card>
);
